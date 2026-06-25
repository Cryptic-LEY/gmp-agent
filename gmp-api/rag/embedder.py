"""
批量生成 Embedding 并写入 MySQL（01-vector-engine 重写版）。

修复点：原版 `from config import DB_PATH` + `sqlite3`，MySQL 迁移后 config 已无
DB_PATH，import 即崩。现改为 pymysql（复用 retriever._get_conn）+ small-to-big 分块。

运行：python -m rag.embedder
策略：
  - 源表 reg_library → chunk_text 切 small/big → 批量 embed small_text → 写 reg_chunks
  - 断点续传：only_missing=True 跳过已切块的 reg_id
  - embed_fn 可注入，便于单测用假向量（不连网、不写真库）
"""
from __future__ import annotations

import json
import time

import httpx

from config import (
    EMB_BASE_URL, EMB_API_KEY, EMB_MODEL,
    CHUNK_SMALL, CHUNK_BIG, CHUNK_OVERLAP,
)
from rag.chunker import chunk_text
from rag.retriever import _get_conn

BATCH_SIZE = 10   # DashScope text-embedding-v3 单批上限 10 条
SLEEP_SEC = 1.5

DDL_REG_CHUNKS = """
CREATE TABLE IF NOT EXISTS reg_chunks (
    chunk_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    reg_id     VARCHAR(64) NOT NULL,
    seq        INT NOT NULL,
    small_text MEDIUMTEXT,
    big_text   MEDIUMTEXT,
    embedding  MEDIUMTEXT,
    meta       TEXT,
    INDEX idx_reg_chunks_reg (reg_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""


# ── 纯逻辑：把一条源记录切成 chunk 行（无 DB / 无网络） ──────────────────────────
def build_chunk_rows(
    reg_id: str,
    article_num: str,
    content: str,
    *,
    doc_type: str = "regulation",
    source_name: str = "",
    is_article: bool = True,
    edu_level: str | None = None,
    small: int = CHUNK_SMALL,
    big: int = CHUNK_BIG,
    overlap: int = CHUNK_OVERLAP,
) -> list[dict]:
    """切块并附带元数据。返回 [{reg_id, seq, small_text, big_text, meta}, ...]。"""
    rows: list[dict] = []
    for ch in chunk_text(content or "", small=small, big=big, overlap=overlap):
        rows.append({
            "reg_id": reg_id,
            "seq": ch.seq,
            "small_text": ch.small_text,
            "big_text": ch.big_text,
            "meta": {
                "doc_type": doc_type,
                "source_name": source_name,
                "is_article": is_article,
                "article_num": article_num or "",
                "edu_level": edu_level,
            },
        })
    return rows


# ── 真实 DashScope 批量嵌入（付费路径，可被注入替换） ──────────────────────────
def embed_batch(texts: list[str]) -> list[list[float]] | None:
    if not EMB_API_KEY:
        print("⚠ EMB_API_KEY 未设置，跳过 embedding 生成")
        return None
    try:
        resp = httpx.post(
            f"{EMB_BASE_URL}/embeddings",
            headers={"Authorization": f"Bearer {EMB_API_KEY}"},
            json={"model": EMB_MODEL, "input": texts},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()["data"]
        data.sort(key=lambda x: x["index"])
        return [item["embedding"] for item in data]
    except Exception as e:  # noqa: BLE001
        print(f"  API错误: {e}")
        return None


def ensure_tables(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(DDL_REG_CHUNKS)
    conn.commit()


# ── 编排：两段式重建 reg_chunks ───────────────────────────────────────────────
# Phase 1（免费，无 API）：切块写入，embedding 留空。
# Phase 2（付费）：按 `embedding IS NULL` 批量嵌入并回填 —— 崩溃可断点续传（spec §4.2）。
def write_chunk_rows(conn, *, only_missing: bool = True) -> int:
    """Phase 1：reg_library → 切块 → 写 reg_chunks（embedding=NULL）。返回写入块数。"""
    ensure_tables(conn)
    cur = conn.cursor()

    done_reg_ids: set[str] = set()
    if only_missing:
        cur.execute("SELECT DISTINCT reg_id FROM reg_chunks")
        done_reg_ids = {r[0] for r in cur.fetchall()}

    cur.execute("SELECT reg_id, article_num, content FROM reg_library WHERE content IS NOT NULL")
    sources = [r for r in cur.fetchall() if r[0] not in done_reg_ids]

    written = 0
    for reg_id, article_num, content in sources:
        for row in build_chunk_rows(reg_id, article_num, content):
            cur.execute(
                "INSERT INTO reg_chunks (reg_id, seq, small_text, big_text, embedding, meta) "
                "VALUES (%s,%s,%s,%s,NULL,%s)",
                (row["reg_id"], row["seq"], row["small_text"], row["big_text"],
                 json.dumps(row["meta"], ensure_ascii=False)),
            )
            written += 1
    conn.commit()
    return written


def embed_pending_chunks(conn, embed_fn=embed_batch, *,
                         batch_size: int = BATCH_SIZE, sleep_sec: float = SLEEP_SEC) -> int:
    """Phase 2：给 embedding IS NULL 的块批量嵌入并回填。可重复调用断点续传。"""
    cur = conn.cursor()
    cur.execute("SELECT chunk_id, small_text FROM reg_chunks WHERE embedding IS NULL")
    pending = cur.fetchall()

    embedded = 0
    for i in range(0, len(pending), batch_size):
        batch = pending[i:i + batch_size]
        vecs = embed_fn([r[1] for r in batch])
        if vecs is None:
            break
        for (chunk_id, _), vec in zip(batch, vecs):
            cur.execute("UPDATE reg_chunks SET embedding=%s WHERE chunk_id=%s",
                        (json.dumps(vec), chunk_id))
        conn.commit()
        embedded += len(batch)
        if i + batch_size < len(pending):
            time.sleep(sleep_sec)
    return embedded


def rebuild_reg_chunks(conn, embed_fn=embed_batch, *, only_missing: bool = True,
                       batch_size: int = BATCH_SIZE, sleep_sec: float = SLEEP_SEC) -> dict:
    """两段式重建：先免费切块写入，再付费嵌入回填。返回统计。"""
    written = write_chunk_rows(conn, only_missing=only_missing)
    embedded = embed_pending_chunks(conn, embed_fn, batch_size=batch_size, sleep_sec=sleep_sec)
    return {"chunks_written": written, "chunks_embedded": embedded}


def run() -> None:
    with _get_conn() as conn:
        stats = rebuild_reg_chunks(conn)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM reg_chunks WHERE embedding IS NOT NULL")
        total = cur.fetchone()[0]
    print(f"\nreg_chunks 重建完成：新切块写入 {stats['chunks_written']} 块、"
          f"本次嵌入 {stats['chunks_embedded']} 块；库内已有向量 {total} 块")


if __name__ == "__main__":
    run()
