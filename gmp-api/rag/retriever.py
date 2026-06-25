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
    EMB_BASE_URL, EMB_API_KEY, EMB_MODEL,
    RAG_TOP_K, RAG_GRAPH_HOP, RAG_THRESHOLD,
    RAG_GRAPH_THRESHOLD, RAG_FINAL_TOP_N,
    RAG_RERANK_ENABLED, RAG_RERANK_TOP_BEFORE,
    RAG_PARALLEL_RETRIEVE,
)


@dataclass
class DocChunk:
    id: str          # reg_id 或 kp_id
    doc_type: str    # 'regulation' | 'kp'
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


def _article_lookup(conn, question: str) -> list[tuple]:
    """硬指标：从问题里抽「第X条」直接按 article_num 精确命中（BM25 死磕硬指标场景）。"""
    nums = _ARTICLE_RE.findall(question)
    if not nums:
        return []
    cur = conn.cursor()
    ph = ','.join(['%s'] * len(nums))
    cur.execute(
        f"SELECT reg_id, article_num, content FROM reg_library WHERE article_num IN ({ph})",
        nums,
    )
    return cur.fetchall()


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


def _parallel_fetch(question: str, query_vec: list[float], edu_level, idx):
    """
    并行检索内核：向量搜索（faiss）与 MySQL FULLTEXT + article_lookup 同时执行。
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
    混合检索主入口：进程内 faiss 向量索引 + MySQL FULLTEXT + kp_reg_links 图遍历。

    不再每请求全量加载向量；BM25/图遍历命中的条目用索引内重建向量重打分。
    query_vec 可注入（测试/缓存复用），省去 DashScope 查询嵌入。
    RAG_PARALLEL_RETRIEVE=True 时向量检索与 MySQL 查询并发执行（B8）。
    """
    from rag.vector_index import get_index

    if query_vec is None:
        from rag.hyde import hyde_embed
        query_vec = hyde_embed(question) or embed_query(question)
    idx = get_index()

    with _get_conn() as conn:
        if not query_vec or idx is None or idx.size == 0:
            return _keyword_fallback_chunks(conn, question, edu_level)

        # ── 1+1b+2: 向量、article、FULLTEXT（串行或并行） ────────────────────
        if RAG_PARALLEL_RETRIEVE:
            vector_hits, ft_ids_raw, art_rows = _parallel_fetch(question, query_vec, edu_level, idx)
            # 将并行结果填入 all_reg / all_kp
            all_reg: dict[str, tuple] = {}
            all_kp: dict[str, tuple] = {}
            for h in vector_hits:
                if h.score < RAG_THRESHOLD:
                    continue
                bucket = all_reg if h.doc_type == 'regulation' else all_kp
                if len(bucket) < RAG_TOP_K:
                    bucket[h.id] = (h.id, h.title, h.content, h.score)
            # article 置顶
            if art_rows:
                art_sims = idx.similarity(query_vec, [r[0] for r in art_rows])
                ranked = sorted(art_rows, key=lambda r: art_sims.get(r[0], 0.0), reverse=True)
                for reg_id, art, content in ranked[:ARTICLE_HIT_CAP]:
                    all_reg[reg_id] = (reg_id, art or '', content or '', 1.0)
            # BM25 重打分
            ft_ids = [r for r in ft_ids_raw if r not in all_reg]
            for r_id, score in idx.similarity(query_vec, ft_ids).items():
                if score < RAG_GRAPH_THRESHOLD:
                    continue
                rec = idx.get_record(r_id)
                if rec:
                    all_reg[r_id] = (r_id, rec['title'], rec['content'], score)
        else:
            # ── 1. 向量召回（faiss，edu_level 在索引内过滤） ─────────────────
            all_reg: dict[str, tuple] = {}
            all_kp: dict[str, tuple] = {}
            for h in idx.search(query_vec, k=RAG_TOP_K * 4, edu_level=edu_level):
                if h.score < RAG_THRESHOLD:
                    continue
                bucket = all_reg if h.doc_type == 'regulation' else all_kp
                if len(bucket) < RAG_TOP_K:
                    bucket[h.id] = (h.id, h.title, h.content, h.score)

            # ── 1b. 硬指标：第X条精确命中（article_num 直查置顶） ──────────────
            art_rows = _article_lookup(conn, question)
            if art_rows:
                art_sims = idx.similarity(query_vec, [r[0] for r in art_rows])
                ranked = sorted(art_rows, key=lambda r: art_sims.get(r[0], 0.0), reverse=True)
                for reg_id, art, content in ranked[:ARTICLE_HIT_CAP]:
                    all_reg[reg_id] = (reg_id, art or '', content or '', 1.0)

            # ── 2. BM25(FULLTEXT) 召回 → 用索引重打分并入池 ──────────────────
            ft_ids = [r for r in _fulltext_search(conn, question, RAG_TOP_K) if r not in all_reg]
            for r_id, score in idx.similarity(query_vec, ft_ids).items():
                if score < RAG_GRAPH_THRESHOLD:
                    continue
                rec = idx.get_record(r_id)
                if rec:
                    all_reg[r_id] = (r_id, rec['title'], rec['content'], score)

        # ── 3. kp_reg_links 一跳图遍历扩展 ──────────────────────────────────
        extra_reg_ids, extra_kp_ids = _graph_expand(conn, list(all_reg), list(all_kp))

        for r_id, score in idx.similarity(query_vec, [r for r in extra_reg_ids if r not in all_reg]).items():
            if score < RAG_GRAPH_THRESHOLD:
                continue
            rec = idx.get_record(r_id)
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

        # ── 4. 排序截取 top-N（沿用 reg/kp 配额） ───────────────────────────
        reg_quota = max(0, min(10, RAG_FINAL_TOP_N - 2))
        kp_quota = max(0, RAG_FINAL_TOP_N - reg_quota)

        sorted_reg = sorted(all_reg.values(), key=lambda x: x[3], reverse=True)[:reg_quota]
        sorted_kp = sorted(all_kp.values(), key=lambda x: x[3], reverse=True)[:kp_quota]

        chunks: list[DocChunk] = []
        for r_id, title, content, score in sorted_reg:
            chunks.append(DocChunk(r_id, 'regulation', title, content, score))
        for k_id, title, content, score in sorted_kp:
            chunks.append(DocChunk(k_id, 'kp', title, content, score))

        if RAG_RERANK_ENABLED and chunks:
            from rag.reranker import rerank as _rerank
            chunks = _rerank(question, chunks[:RAG_RERANK_TOP_BEFORE],
                             top_n=RAG_FINAL_TOP_N, rerank_fn=rerank_fn)

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
