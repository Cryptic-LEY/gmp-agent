"""
RAG检索模块：向量检索 + FULLTEXT混合检索 + 知识图谱遍历（MySQL版）。

检索流程：
  1. 向量检索（top-K） + MySQL FULLTEXT检索（top-K） 并行执行
  2. FULLTEXT发现的候选用内存向量重新打分，两路结果合并
  3. 通过kp_reg_links做一跳图遍历，扩展候选池
  4. 全候选统一向量打分排序，取 top-N 输出
"""
import json
import math
import re
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


def _load_embeddings(conn) -> tuple[list[tuple], list[tuple]]:
    cur = conn.cursor()
    reg_rows, kp_rows = [], []

    cur.execute(
        "SELECT reg_id, article_num, content, embedding FROM reg_library WHERE embedding IS NOT NULL"
    )
    for reg_id, article_num, content, emb_json in cur.fetchall():
        try:
            reg_rows.append((reg_id, article_num or '', content or '', json.loads(emb_json)))
        except (json.JSONDecodeError, TypeError):
            pass

    cur.execute(
        "SELECT kp_id, title, content, embedding, edu_level FROM knowledge_points WHERE embedding IS NOT NULL"
    )
    for kp_id, title, content, emb_json, edu_lv in cur.fetchall():
        try:
            kp_rows.append((kp_id, title or '', content or '', json.loads(emb_json), edu_lv or ''))
        except (json.JSONDecodeError, TypeError):
            pass

    return reg_rows, kp_rows


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


def retrieve(question: str, edu_level: str | None = None) -> list[DocChunk]:
    """混合检索主入口（MySQL版）。"""
    query_vec = embed_query(question)

    with _get_conn() as conn:
        reg_data, kp_data = _load_embeddings(conn)

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

        kp_pool = [k for k in kp_data if not edu_level or not k[4] or k[4] == edu_level]
        kp_vec = sorted(
            [(k_id, title, content, _cosine(query_vec, vec)) for k_id, title, content, vec, _ in kp_pool],
            key=lambda x: x[3], reverse=True,
        )
        kp_vec = [k for k in kp_vec if k[3] >= RAG_THRESHOLD][:RAG_TOP_K]

        # ── 2. FULLTEXT 检索 ─────────────────────────────────────────────────
        ft_ids = _fulltext_search(conn, question, RAG_TOP_K)

        # ── 3. 合并候选池 ────────────────────────────────────────────────────
        all_reg: dict[str, tuple] = {r[0]: r for r in reg_vec}

        for r_id in ft_ids:
            if r_id in all_reg:
                continue
            if r_id in reg_emb_map:
                _, title, content, vec = reg_emb_map[r_id]
                score = _cosine(query_vec, vec)
                if score >= RAG_GRAPH_THRESHOLD:
                    all_reg[r_id] = (r_id, title, content, score)

        # ── 4. 图遍历扩展 ────────────────────────────────────────────────────
        top_reg_ids = list(all_reg.keys())
        top_kp_ids  = [k[0] for k in kp_vec]
        extra_reg_ids, extra_kp_ids = _graph_expand(conn, top_reg_ids, top_kp_ids)

        for r_id in extra_reg_ids:
            if r_id in all_reg or r_id not in reg_emb_map:
                continue
            _, title, content, vec = reg_emb_map[r_id]
            score = _cosine(query_vec, vec)
            if score >= RAG_GRAPH_THRESHOLD:
                all_reg[r_id] = (r_id, title, content, score)

        all_kp: dict[str, tuple] = {k[0]: k for k in kp_vec}
        for k_id in extra_kp_ids:
            if k_id in all_kp or k_id not in kp_emb_map:
                continue
            entry = kp_emb_map[k_id]
            if edu_level and entry[4] and entry[4] != edu_level:
                continue
            _, title, content, vec, _ = entry
            score = _cosine(query_vec, vec)
            if score >= RAG_GRAPH_THRESHOLD:
                all_kp[k_id] = (k_id, title, content, score)

        # ── 5. 排序截取 top-N ─────────────────────────────────────────────────
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
