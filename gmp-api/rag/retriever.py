"""
RAG检索模块：向量检索 + FULLTEXT混合检索 + 知识图谱遍历（MySQL版）。

检索流程：
  1. 向量检索（top-K） + MySQL FULLTEXT检索（top-K） 并行执行
  2. FULLTEXT发现的候选用内存向量重新打分，两路结果合并
  3. 通过kp_reg_links做一跳图遍历，扩展候选池
  4. 全候选统一向量打分排序，取 top-N 输出
"""
import re
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass

import httpx
import pymysql
import pymysql.cursors

from config import (
    MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE,
    MYSQL_SSL_DISABLED,
    EMB_BASE_URL, EMB_API_KEY, EMB_MODEL,
    RAG_TOP_K, RAG_GRAPH_HOP, RAG_THRESHOLD,
    RAG_GRAPH_THRESHOLD, RAG_FINAL_TOP_N,
    RAG_RERANK_ENABLED, RAG_RERANK_TOP_BEFORE,
    RAG_PARALLEL_RETRIEVE,
    RAG_FUSION_VEC_WEIGHT, RAG_FUSION_BM25_WEIGHT,
    RAG_HYDE_ENABLED,
)


@dataclass
class DocChunk:
    id: str          # reg_id 或 kp_id
    doc_type: str    # 'regulation' | 'kp' | 'experience'
    title: str
    content: str
    score: float


@contextmanager
def _get_conn():
    conn = pymysql.connect(
        host=MYSQL_HOST, port=MYSQL_PORT,
        user=MYSQL_USER, password=MYSQL_PASSWORD,
        database=MYSQL_DATABASE, charset='utf8mb4',
        cursorclass=pymysql.cursors.Cursor,
        connect_timeout=2,
        ssl_disabled=MYSQL_SSL_DISABLED,  # 本机 localhost 免 SSL 握手：建连 ~30ms→~1ms（A3）
    )
    try:
        yield conn
    finally:
        conn.close()


def embed_query(text: str) -> list[float] | None:
    if not EMB_API_KEY:
        return None
    try:
        resp = httpx.post(
            f"{EMB_BASE_URL}/embeddings",
            headers={"Authorization": f"Bearer {EMB_API_KEY}"},
            json={"model": EMB_MODEL, "input": text},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()["data"][0]["embedding"]
    except Exception:
        return None


_ARTICLE_RE = re.compile(r'第([一二三四五六七八九十百千零〇\d]+)条')
ARTICLE_HIT_CAP = 3   # 第X条直查最多置顶几条（多文档共享条号时按相关度取前几）

# 附录/专项法规提示词：问题点名这些时，第X条可能指附录条款而非主规范
_APPENDIX_HINT_RE = re.compile(
    r'附录|无菌|生物制品|血液制品|中药|饮片|临床试验|疫苗|医用氧|放射|'
    r'生化|计算机化|取样|确认与验证|细胞|基因|委托|受托'
)


def _article_lookup(conn, question: str) -> list[tuple]:
    """硬指标：从问题里抽「第X条」直接按 article_num 精确命中（BM25 死磕硬指标场景）。

    消歧：同一 article_num（如「十」）在 22+ 部法规/附录里都存在。裸「GMP第X条」
    默认指主规范 REG-GMP2010-*；只有问题点名附录/专项（无菌/生物制品/受托生产…）时
    才放开全部候选，交给下游向量相似度排序。否则「第十条」会被受托生产法规(十)等抢排。
    """
    nums = _ARTICLE_RE.findall(question)
    if not nums:
        return []
    cur = conn.cursor()
    ph = ','.join(['%s'] * len(nums))
    cur.execute(
        f"SELECT reg_id, article_num, content FROM reg_library WHERE article_num IN ({ph})",
        nums,
    )
    rows = cur.fetchall()
    if not _APPENDIX_HINT_RE.search(question):
        main = [r for r in rows if r[0].startswith('REG-GMP2010-')]
        if main:
            return main
    return rows


def _fulltext_search(conn, question: str, top_k: int) -> list[str]:
    """MySQL FULLTEXT 检索，返回按相关度排序的 reg_id 列表。"""
    cur = conn.cursor()
    q = re.sub(r'[^一-鿿a-zA-Z0-9]', ' ', question).strip()
    if not q:
        return []
    try:
        cur.execute(
            "SELECT reg_id FROM reg_library WHERE MATCH(content) AGAINST (%s IN BOOLEAN MODE) LIMIT %s",
            (q, top_k * 2),
        )
        return [r[0] for r in cur.fetchall()]
    except Exception:
        return []


def _graph_expand(conn, reg_ids: list[str], kp_ids: list[str]) -> tuple[list[str], list[str]]:
    cur = conn.cursor()
    extra_kp_ids: set[str] = set()
    extra_reg_ids: set[str] = set()

    if reg_ids:
        ph = ','.join(['%s'] * len(reg_ids))
        cur.execute(f"SELECT DISTINCT kp_id FROM kp_reg_links WHERE reg_id IN ({ph})", reg_ids)
        extra_kp_ids.update(r[0] for r in cur.fetchall())

    if kp_ids:
        ph = ','.join(['%s'] * len(kp_ids))
        cur.execute(f"SELECT DISTINCT reg_id FROM kp_reg_links WHERE kp_id IN ({ph})", kp_ids)
        extra_reg_ids.update(r[0] for r in cur.fetchall())

    return (
        [r for r in extra_reg_ids if r not in reg_ids],
        [k for k in extra_kp_ids if k not in kp_ids],
    )


def _fuse_scores(
    vec_scores: dict[str, float],
    bm25_scores: dict[str, float],
    vec_weight: float,
    bm25_weight: float,
) -> dict[str, float]:
    """Min-max 归一化后加权融合两路分数（spec P2 §4.4）。"""
    def _minmax(d: dict[str, float]) -> dict[str, float]:
        if not d:
            return {}
        lo, hi = min(d.values()), max(d.values())
        span = hi - lo + 1e-9
        return {k: (v - lo) / span for k, v in d.items()}

    vn = _minmax(vec_scores)
    bn = _minmax(bm25_scores)
    return {
        rid: vec_weight * vn.get(rid, 0.0) + bm25_weight * bn.get(rid, 0.0)
        for rid in set(vn) | set(bn)
    }


def _parallel_fetch(question: str, query_vec: list[float], edu_level, idx):
    """
    并行检索内核：向量搜索（HNSW）与 MySQL FULLTEXT + article_lookup 同时执行。
    返回 (vector_hits, ft_ids, art_rows)
    向量搜索纯内存无需 DB；MySQL 路径在此函数内用独立连接。
    """
    with ThreadPoolExecutor(max_workers=2) as ex:
        f_vec = ex.submit(idx.search, query_vec, RAG_TOP_K * 4, edu_level)

        def _mysql_tasks():
            with _get_conn() as c:
                return _article_lookup(c, question), _fulltext_search(c, question, RAG_TOP_K)

        f_mysql = ex.submit(_mysql_tasks)
        vector_hits = f_vec.result()
        art_rows, ft_ids = f_mysql.result()
    return vector_hits, ft_ids, art_rows


def retrieve(question: str, edu_level: str | None = None,
             query_vec: list[float] | None = None,
             rerank_fn=None) -> list[DocChunk]:
    """
    混合检索主入口：进程内 HNSW 向量索引 + MySQL FULLTEXT + kp_reg_links 图遍历。

    不再每请求全量加载向量；BM25/图遍历命中的条目用索引内重建向量重打分。
    query_vec 可注入（测试/缓存复用），省去 DashScope 查询嵌入。
    RAG_PARALLEL_RETRIEVE=True 时向量检索与 MySQL 查询并发执行（B8）。
    """
    from rag.vector_index import get_index

    if RAG_HYDE_ENABLED:
        # HyDE 开启时，无论调用方是否传入 query_vec，都用 HyDE 向量做检索；
        # 调用方传入的 query_vec 仅用于缓存 key，不传给检索路径。
        from rag.hyde import hyde_embed
        query_vec = hyde_embed(question) or query_vec or embed_query(question)
    elif query_vec is None:
        from rag.hyde import hyde_embed
        query_vec = hyde_embed(question) or embed_query(question)
    idx = get_index()

    with _get_conn() as conn:
        if not query_vec or idx is None or idx.size == 0:
            return _keyword_fallback_chunks(conn, question, edu_level)

        # 历史经验候选池（独立收集，不混入法规引用池；spec C6）
        all_experience: dict[str, tuple] = {}

        # ── 1+1b+2: 向量、article、FULLTEXT（串行或并行） ────────────────────
        if RAG_PARALLEL_RETRIEVE:
            vector_hits, ft_ids_raw, art_rows = _parallel_fetch(question, query_vec, edu_level, idx)
            # 将并行结果收集为原始分 → 后续 min-max 融合
            all_kp: dict[str, tuple] = {}
            _vec_reg_scores: dict[str, float] = {}
            _vec_reg_meta: dict[str, tuple] = {}
            for h in vector_hits:
                if h.score < RAG_THRESHOLD:
                    continue
                if h.doc_type == 'kp':
                    if len(all_kp) < RAG_TOP_K:
                        all_kp[h.id] = (h.id, h.title, h.content, h.score)
                elif h.doc_type == 'experience':
                    if len(all_experience) < 2:
                        all_experience[h.id] = (h.id, h.content, h.score * 0.5)
                else:
                    _vec_reg_scores[h.id] = h.score
                    _vec_reg_meta[h.id] = (h.title, h.content)
            # BM25 cosine 重打分（全量 ft_ids_raw，不过滤 vec 已命中项）
            _bm25_sims = idx.similarity(query_vec, ft_ids_raw)
            _bm25_reg_scores: dict[str, float] = {
                r: s for r, s in _bm25_sims.items() if s >= RAG_GRAPH_THRESHOLD
            }
            _bm25_reg_meta: dict[str, tuple] = {}
            for _rid in _bm25_reg_scores:
                _rec = idx.get_best_record(_rid, query_vec)
                if _rec:
                    _bm25_reg_meta[_rid] = (_rec['title'], _rec['content'])
            # min-max 归一化 + 0.6/0.4 加权融合
            _fused = _fuse_scores(_vec_reg_scores, _bm25_reg_scores,
                                  RAG_FUSION_VEC_WEIGHT, RAG_FUSION_BM25_WEIGHT)
            all_reg: dict[str, tuple] = {}
            for _rid, _fscore in sorted(_fused.items(), key=lambda x: x[1], reverse=True)[:RAG_TOP_K]:
                if _rid in _vec_reg_meta:
                    _t, _c = _vec_reg_meta[_rid]
                elif _rid in _bm25_reg_meta:
                    _t, _c = _bm25_reg_meta[_rid]
                else:
                    continue
                all_reg[_rid] = (_rid, _t, _c, _fscore)
            # article 置顶（融合后覆盖，强制 score=1.0）
            if art_rows:
                art_sims = idx.similarity(query_vec, [r[0] for r in art_rows])
                ranked = sorted(art_rows, key=lambda r: art_sims.get(r[0], 0.0), reverse=True)
                for reg_id, art, content in ranked[:ARTICLE_HIT_CAP]:
                    all_reg[reg_id] = (reg_id, art or '', content or '', 1.0)
        else:
            # ── 1. 向量召回（HNSW，edu_level 在索引内过滤） ──────────────────
            all_kp: dict[str, tuple] = {}
            _vec_reg_scores: dict[str, float] = {}
            _vec_reg_meta: dict[str, tuple] = {}
            for h in idx.search(query_vec, k=RAG_TOP_K * 4, edu_level=edu_level):
                if h.score < RAG_THRESHOLD:
                    continue
                if h.doc_type == 'kp':
                    if len(all_kp) < RAG_TOP_K:
                        all_kp[h.id] = (h.id, h.title, h.content, h.score)
                elif h.doc_type == 'experience':
                    if len(all_experience) < 2:
                        all_experience[h.id] = (h.id, h.content, h.score * 0.5)
                else:
                    _vec_reg_scores[h.id] = h.score
                    _vec_reg_meta[h.id] = (h.title, h.content)

            # ── 1b. 硬指标：第X条精确命中（article_num 直查置顶） ──────────────
            art_rows = _article_lookup(conn, question)

            # ── 2. BM25(FULLTEXT) 召回 → cosine 重打分（全量，不过滤 vec 已命中项）
            _ft_ids_all = _fulltext_search(conn, question, RAG_TOP_K)
            _bm25_sims = idx.similarity(query_vec, _ft_ids_all)
            _bm25_reg_scores: dict[str, float] = {
                r: s for r, s in _bm25_sims.items() if s >= RAG_GRAPH_THRESHOLD
            }
            _bm25_reg_meta: dict[str, tuple] = {}
            for _rid in _bm25_reg_scores:
                _rec = idx.get_best_record(_rid, query_vec)
                if _rec:
                    _bm25_reg_meta[_rid] = (_rec['title'], _rec['content'])
            # min-max 归一化 + 0.6/0.4 加权融合
            _fused = _fuse_scores(_vec_reg_scores, _bm25_reg_scores,
                                  RAG_FUSION_VEC_WEIGHT, RAG_FUSION_BM25_WEIGHT)
            all_reg: dict[str, tuple] = {}
            for _rid, _fscore in sorted(_fused.items(), key=lambda x: x[1], reverse=True)[:RAG_TOP_K]:
                if _rid in _vec_reg_meta:
                    _t, _c = _vec_reg_meta[_rid]
                elif _rid in _bm25_reg_meta:
                    _t, _c = _bm25_reg_meta[_rid]
                else:
                    continue
                all_reg[_rid] = (_rid, _t, _c, _fscore)
            # article 置顶（融合后覆盖，强制 score=1.0）
            if art_rows:
                art_sims = idx.similarity(query_vec, [r[0] for r in art_rows])
                ranked = sorted(art_rows, key=lambda r: art_sims.get(r[0], 0.0), reverse=True)
                for reg_id, art, content in ranked[:ARTICLE_HIT_CAP]:
                    all_reg[reg_id] = (reg_id, art or '', content or '', 1.0)

        # ── 3. kp_reg_links 一跳图遍历扩展 ──────────────────────────────────
        extra_reg_ids, extra_kp_ids = _graph_expand(conn, list(all_reg), list(all_kp))

        for r_id, score in idx.similarity(query_vec, [r for r in extra_reg_ids if r not in all_reg]).items():
            if score < RAG_GRAPH_THRESHOLD:
                continue
            rec = idx.get_best_record(r_id, query_vec)
            if rec:
                all_reg[r_id] = (r_id, rec['title'], rec['content'], score)

        for k_id, score in idx.similarity(query_vec, [k for k in extra_kp_ids if k not in all_kp]).items():
            if score < RAG_GRAPH_THRESHOLD:
                continue
            rec = idx.get_record(k_id)
            if not rec:
                continue
            if edu_level and rec.get('edu_level') and rec['edu_level'] != edu_level:
                continue
            all_kp[k_id] = (k_id, rec['title'], rec['content'], score)

        # ── 4. 排序截取 top-N ────────────────────────────────────────────────
        # 经验条独立池：不参与 rerank 竞争，始终追加末尾（spec C6：0.5x 低权重辅助参考）。
        # exp_cap = min(2, TOP_N//2)：经验最多 2 席，且永远不超过主内容席位（保证法规/知识点占多数）。
        exp_cap = min(2, RAG_FINAL_TOP_N // 2)
        exp_chunks = [
            DocChunk(exp_id, 'experience', '', exp_content, exp_score)
            for exp_id, exp_content, exp_score in list(all_experience.values())[:exp_cap]
        ]

        # 主内容（reg/kp）预算 = 总预算扣掉经验席位，且 ≥1
        main_budget = max(1, RAG_FINAL_TOP_N - len(exp_chunks))
        # kp 预留 ≤2 席，但绝不把法规挤到 0（法规是逐字引用核心，优先保障）
        kp_reserve = min(2, len(all_kp), max(0, main_budget - 1))
        reg_quota = min(len(all_reg), main_budget - kp_reserve)
        kp_quota = min(len(all_kp), main_budget - reg_quota)  # 法规不足时 kp 补齐

        sorted_reg = sorted(all_reg.values(), key=lambda x: x[3], reverse=True)[:reg_quota]
        sorted_kp = sorted(all_kp.values(), key=lambda x: x[3], reverse=True)[:kp_quota]

        chunks: list[DocChunk] = []
        for r_id, title, content, score in sorted_reg:
            chunks.append(DocChunk(r_id, 'regulation', title, content, score))
        for k_id, title, content, score in sorted_kp:
            chunks.append(DocChunk(k_id, 'kp', title, content, score))

        if RAG_RERANK_ENABLED and chunks:
            from rag.reranker import rerank as _rerank
            # experience 不参与 rerank，只对 reg/kp 重排；top_n = 主内容预算
            chunks = _rerank(question, chunks[:RAG_RERANK_TOP_BEFORE],
                             top_n=main_budget, rerank_fn=rerank_fn)
        else:
            chunks = chunks[:main_budget]

        # 追加经验条至末尾（始终在法规/知识点之后，总量 = len(reg/kp) + len(exp) ≤ RAG_FINAL_TOP_N）
        chunks = chunks + exp_chunks

        return chunks


def _keyword_fallback_chunks(conn, question: str, edu_level: str | None) -> list[DocChunk]:
    """Embedding不可用时的关键词降级检索。"""
    cur = conn.cursor()
    keywords = [w for w in re.sub(r'[？?]', '', question).split() if len(w) > 1] or [question[:10]]
    like_clause = ' OR '.join('content LIKE %s' for _ in keywords)
    params = [f'%{kw}%' for kw in keywords]

    cur.execute(
        f"SELECT reg_id, article_num, content FROM reg_library WHERE {like_clause} LIMIT %s",
        params + [RAG_TOP_K],
    )
    chunks = [DocChunk(r[0], 'regulation', r[1] or '', r[2] or '', 0.5) for r in cur.fetchall()]

    edu_filter = "AND edu_level = %s" if edu_level else ''
    kp_params = params + ([edu_level] if edu_level else []) + [RAG_TOP_K]
    cur.execute(
        f"SELECT kp_id, title, content FROM knowledge_points WHERE ({like_clause}) {edu_filter} LIMIT %s",
        kp_params,
    )
    chunks += [DocChunk(k[0], 'kp', k[1] or '', k[2] or '', 0.5) for k in cur.fetchall()]
    return chunks
