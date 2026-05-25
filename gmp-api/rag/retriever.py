"""
RAG检索模块：向量检索 + BM25混合检索 + 知识图谱遍历。

检索流程：
  1. 向量检索（top-K） + BM25全文检索（top-K） 并行执行
  2. BM25发现的候选用内存向量重新打分，两路结果合并
  3. 通过kp_reg_links做一跳图遍历，扩展候选池
  4. 全候选统一向量打分排序，取 top-N 输出
"""
import json
import math
import re
import sqlite3
from dataclasses import dataclass

import httpx

from config import (
    DB_PATH, EMB_BASE_URL, EMB_API_KEY, EMB_MODEL,
    RAG_TOP_K, RAG_GRAPH_HOP, RAG_THRESHOLD,
    RAG_GRAPH_THRESHOLD, RAG_FINAL_TOP_N,
)


@dataclass
class DocChunk:
    id: str          # reg_id 或 kp_id
    doc_type: str    # 'regulation' | 'kp'
    title: str
    content: str
    score: float


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


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


def _load_embeddings(conn: sqlite3.Connection) -> tuple[
    list[tuple],  # reg: (reg_id, title, content, vec)
    list[tuple],  # kp:  (kp_id, title, content, vec, edu_level)
]:
    cur = conn.cursor()
    reg_rows, kp_rows = [], []

    cur.execute("SELECT reg_id, article_num, content, embedding FROM reg_library WHERE embedding IS NOT NULL")
    for reg_id, article_num, content, emb_json in cur.fetchall():
        try:
            reg_rows.append((reg_id, article_num or '', content or '', json.loads(emb_json)))
        except (json.JSONDecodeError, TypeError):
            pass

    # P1-3: 加载 edu_level 字段，供层级过滤使用
    cur.execute("SELECT kp_id, title, content, embedding, edu_level FROM knowledge_points WHERE embedding IS NOT NULL")
    for kp_id, title, content, emb_json, edu_lv in cur.fetchall():
        try:
            kp_rows.append((kp_id, title or '', content or '', json.loads(emb_json), edu_lv or ''))
        except (json.JSONDecodeError, TypeError):
            pass

    return reg_rows, kp_rows


# ── P1-1: BM25 全文检索（FTS5 trigram）────────────────────────────────────────

def _ensure_fts(conn: sqlite3.Connection) -> None:
    """惰性创建/重建 FTS5 索引（行数不一致时自动重建）。"""
    cur = conn.cursor()
    try:
        fts_count = cur.execute("SELECT COUNT(*) FROM reg_fts").fetchone()[0]
        lib_count = cur.execute("SELECT COUNT(*) FROM reg_library").fetchone()[0]
        if fts_count == lib_count:
            return
    except sqlite3.OperationalError:
        pass  # 表不存在

    cur.execute("DROP TABLE IF EXISTS reg_fts")
    try:
        cur.execute("""
            CREATE VIRTUAL TABLE reg_fts
            USING fts5(reg_id UNINDEXED, content, tokenize='trigram')
        """)
    except sqlite3.OperationalError:
        # SQLite版本不支持trigram，退回默认分词器
        cur.execute("CREATE VIRTUAL TABLE reg_fts USING fts5(reg_id UNINDEXED, content)")
    cur.execute(
        "INSERT INTO reg_fts(reg_id, content) "
        "SELECT reg_id, "
        "  COALESCE('第'||article_num||'条 ','') || "
        "  COALESCE(article_num,'') || ' ' || "
        "  COALESCE(content,'') "
        "FROM reg_library WHERE content IS NOT NULL"
    )
    conn.commit()


def _bm25_search(conn: sqlite3.Connection, question: str, top_k: int) -> list[str]:
    """BM25 全文检索，返回按相关度排序的 reg_id 列表。"""
    cur = conn.cursor()
    # 保留中文字符和字母数字，去除FTS5特殊符号
    q = re.sub(r'[^一-鿿a-zA-Z0-9]', ' ', question).strip()
    if not q:
        return []
    try:
        rows = cur.execute(
            "SELECT reg_id FROM reg_fts WHERE reg_fts MATCH ? ORDER BY rank LIMIT ?",
            (q, top_k)
        ).fetchall()
        return [r[0] for r in rows]
    except sqlite3.OperationalError:
        return []


# ── 图遍历 ────────────────────────────────────────────────────────────────────

def _graph_expand(conn: sqlite3.Connection, reg_ids: list[str], kp_ids: list[str]) -> tuple[list[str], list[str]]:
    cur = conn.cursor()
    extra_kp_ids: set[str] = set()
    extra_reg_ids: set[str] = set()

    if reg_ids:
        ph = ','.join('?' * len(reg_ids))
        cur.execute(f"SELECT DISTINCT kp_id FROM kp_reg_links WHERE reg_id IN ({ph})", reg_ids)
        extra_kp_ids.update(r[0] for r in cur.fetchall())

    if kp_ids:
        ph = ','.join('?' * len(kp_ids))
        cur.execute(f"SELECT DISTINCT reg_id FROM kp_reg_links WHERE kp_id IN ({ph})", kp_ids)
        extra_reg_ids.update(r[0] for r in cur.fetchall())

    return (
        [r for r in extra_reg_ids if r not in reg_ids],
        [k for k in extra_kp_ids if k not in kp_ids],
    )


# ── 主检索入口 ────────────────────────────────────────────────────────────────

def retrieve(question: str, edu_level: str | None = None) -> list[DocChunk]:
    """
    混合检索主入口。
    - P1-1: 向量检索 + BM25 双路，BM25发现的候选用向量重新打分后合并
    - P1-3: KP按edu_level过滤（向量检索阶段和图遍历阶段均生效）
    - 图遍历扩展候选用内存向量重新打分（≥ GRAPH_THRESHOLD 才入选）
    - 全候选统一排序，取 top-N
    """
    query_vec = embed_query(question)

    conn = sqlite3.connect(DB_PATH)
    try:
        _ensure_fts(conn)
        reg_data, kp_data = _load_embeddings(conn)

        # 内存索引：供图遍历候选快速取向量
        reg_emb_map: dict[str, tuple] = {r[0]: r for r in reg_data}
        kp_emb_map:  dict[str, tuple] = {k[0]: k for k in kp_data}

        if not query_vec:
            return _keyword_fallback_chunks(conn, question, edu_level)

        # ── 1. 向量检索 ──────────────────────────────────────────────────────
        reg_vec = sorted(
            [(r_id, title, content, _cosine(query_vec, vec)) for r_id, title, content, vec in reg_data],
            key=lambda x: x[3], reverse=True,
        )
        reg_vec = [r for r in reg_vec if r[3] >= RAG_THRESHOLD][:RAG_TOP_K]

        # P1-3: KP 向量检索只在匹配的学历层级内进行
        kp_pool = [k for k in kp_data if not edu_level or not k[4] or k[4] == edu_level]
        kp_vec = sorted(
            [(k_id, title, content, _cosine(query_vec, vec)) for k_id, title, content, vec, _ in kp_pool],
            key=lambda x: x[3], reverse=True,
        )
        kp_vec = [k for k in kp_vec if k[3] >= RAG_THRESHOLD][:RAG_TOP_K]

        # ── 2. BM25 检索，发现向量检索可能遗漏的精确匹配 ────────────────────
        bm25_ids = _bm25_search(conn, question, RAG_TOP_K * 2)

        # ── 3. 合并候选池（BM25发现的用向量重新打分） ────────────────────────
        all_reg: dict[str, tuple] = {r[0]: r for r in reg_vec}

        for r_id in bm25_ids:
            if r_id in all_reg:
                continue
            if r_id in reg_emb_map:
                _, title, content, vec = reg_emb_map[r_id]
                score = _cosine(query_vec, vec)
                # BM25命中但向量分低于主阈值时，用较宽松的 GRAPH_THRESHOLD 决策
                if score >= RAG_GRAPH_THRESHOLD:
                    all_reg[r_id] = (r_id, title, content, score)

        # ── 4. 图遍历扩展（对所有当前候选做一跳） ────────────────────────────
        top_reg_ids = list(all_reg.keys())
        top_kp_ids  = [k[0] for k in kp_vec]
        extra_reg_ids, extra_kp_ids = _graph_expand(conn, top_reg_ids, top_kp_ids)

        for r_id in extra_reg_ids:
            if r_id in all_reg:
                continue
            if r_id in reg_emb_map:
                _, title, content, vec = reg_emb_map[r_id]
                score = _cosine(query_vec, vec)
                if score >= RAG_GRAPH_THRESHOLD:
                    all_reg[r_id] = (r_id, title, content, score)

        all_kp: dict[str, tuple] = {k[0]: k for k in kp_vec}
        for k_id in extra_kp_ids:
            if k_id in all_kp or k_id not in kp_emb_map:
                continue
            entry = kp_emb_map[k_id]
            # P1-3: 图遍历扩展的KP也必须符合学历层级
            if edu_level and entry[4] and entry[4] != edu_level:
                continue
            _, title, content, vec, _ = entry
            score = _cosine(query_vec, vec)
            if score >= RAG_GRAPH_THRESHOLD:
                all_kp[k_id] = (k_id, title, content, score)

        # ── 5. 排序截取 top-N ─────────────────────────────────────────────────
        # 法规条文与KP分开排序，法规条文保留专属名额（不与KP竞争分数）
        # 分配：法规条文最多10条，KP最多5条，总计不超过 RAG_FINAL_TOP_N
        reg_quota = min(10, RAG_FINAL_TOP_N - 2)
        kp_quota  = RAG_FINAL_TOP_N - reg_quota

        sorted_reg = sorted(all_reg.values(), key=lambda x: x[3], reverse=True)[:reg_quota]
        sorted_kp  = sorted(all_kp.values(),  key=lambda x: x[3], reverse=True)[:kp_quota]

        chunks: list[DocChunk] = []
        for r_id, title, content, score in sorted_reg:
            chunks.append(DocChunk(r_id, 'regulation', title, content, score))
        for k_id, title, content, score in sorted_kp:
            chunks.append(DocChunk(k_id, 'kp', title, content, score))

        return chunks

    finally:
        conn.close()


def _keyword_fallback_chunks(conn: sqlite3.Connection, question: str, edu_level: str | None) -> list[DocChunk]:
    """Embedding不可用时的关键词降级检索。"""
    cur = conn.cursor()
    keywords = [w for w in re.sub(r'[？?]', '', question).split() if len(w) > 1] or [question[:10]]
    like_clause = ' OR '.join('content LIKE ?' for _ in keywords)
    params = [f'%{kw}%' for kw in keywords]

    cur.execute(f"SELECT reg_id, article_num, content FROM reg_library WHERE {like_clause} LIMIT {RAG_TOP_K}", params)
    chunks = [DocChunk(r[0], 'regulation', r[1] or '', r[2] or '', 0.5) for r in cur.fetchall()]

    edu_filter = f"AND edu_level = ?" if edu_level else ''
    kp_params = params + ([edu_level] if edu_level else [])
    cur.execute(
        f"SELECT kp_id, title, content FROM knowledge_points WHERE ({like_clause}) {edu_filter} LIMIT {RAG_TOP_K}",
        kp_params,
    )
    chunks += [DocChunk(k[0], 'kp', k[1] or '', k[2] or '', 0.5) for k in cur.fetchall()]
    return chunks
