"""历史经验回流（层④）：好 case embed 进 01 的向量索引（doc_type='experience'）。

持久化（方案A）：好 case 同时写入 MySQL experience_pool 表，
进程重启 / vector_index.rebuild() 后由 load_experiences() 重新灌回索引，
不再随进程内 HNSW 一起丢失。
"""
from __future__ import annotations

import json
import logging

import pymysql

from config import (
    MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE,
)

logger = logging.getLogger(__name__)

_EXP_PREFIX = "EXP-"


def _get_conn():
    return pymysql.connect(
        host=MYSQL_HOST, port=MYSQL_PORT,
        user=MYSQL_USER, password=MYSQL_PASSWORD,
        database=MYSQL_DATABASE, autocommit=True,
        connect_timeout=2,
    )


def _ensure_table() -> None:
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS experience_pool (
                    exp_id     VARCHAR(64) PRIMARY KEY,
                    question   TEXT        NOT NULL,
                    answer     MEDIUMTEXT  NOT NULL,
                    sources    TEXT,
                    embedding  MEDIUMTEXT,
                    created_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_exp_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)


def _persist_experience(exp_id: str, question: str, answer: str,
                        sources: list[str], vec: list[float]) -> None:
    """把好 case 写入 experience_pool（best-effort，失败静默）。"""
    try:
        _ensure_table()
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO experience_pool (exp_id, question, answer, sources, embedding)
                       VALUES (%s, %s, %s, %s, %s)
                       ON DUPLICATE KEY UPDATE answer=VALUES(answer),
                                               sources=VALUES(sources),
                                               embedding=VALUES(embedding)""",
                    (exp_id, question, answer,
                     json.dumps(sources, ensure_ascii=False),
                     json.dumps(vec)),
                )
    except Exception as exc:
        logger.warning("experience persist failed for %s: %s", exp_id, exc)


def add_experience(
    exp_id: str,
    question: str,
    answer: str,
    sources: list[str],
    embed_fn=None,
    persist: bool = True,
) -> bool:
    """
    把好 case 加入进程内向量索引，并（默认）持久化到 MySQL。

    Args:
        exp_id:    经验条目唯一 ID（如 "exp001"），会加 EXP- 前缀
        question:  历史问题
        answer:    历史好答案（与 question 一起嵌入）
        sources:   原始来源 reg_id 列表（作为元数据存储）
        embed_fn:  embedding 函数 (text: str) -> list[float]
                   默认 rag.retriever.embed_query；可注入 mock 绕开 DashScope
        persist:   是否写入 experience_pool（测试可传 False 跳过 DB）

    Returns:
        True 表示成功加入索引；False 表示降级（索引不可用或嵌入失败）。
    """
    from rag.vector_index import get_index

    idx = get_index()
    if idx is None:
        return False

    if embed_fn is None:
        from rag.retriever import embed_query
        embed_fn = embed_query

    try:
        vec = embed_fn(f"{question} {answer[:500]}")
    except Exception as exc:
        logger.warning("experience embed failed for %s: %s", exp_id, exc)
        return False

    chunk_id = f"{_EXP_PREFIX}{exp_id}"
    idx.add_items([{
        "id":        chunk_id,
        "reg_id":    chunk_id,
        "doc_type":  "experience",
        "title":     question[:100],
        "content":   answer,
        "edu_level": None,
        "vec":       vec,
    }])

    if persist:
        _persist_experience(exp_id, question, answer, sources, vec)
    return True


def load_experiences(idx) -> int:
    """从 experience_pool 把持久化的好 case 灌回给定索引。

    vector_index.build_index() 在重建时调用，保证经验回流跨进程/重建不丢失。
    返回成功加载条数；DB 不可用时返回 0（静默降级）。
    """
    records: list[dict] = []
    try:
        _ensure_table()  # 表不存在时先建（首次运行/空库场景，避免 1146 噪声告警）
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT exp_id, question, answer, embedding FROM experience_pool "
                    "WHERE embedding IS NOT NULL"
                )
                rows = cur.fetchall()
    except Exception as exc:
        logger.warning("load_experiences failed: %s", exc)
        return 0

    for exp_id, question, answer, emb_json in rows:
        try:
            vec = json.loads(emb_json)
        except (json.JSONDecodeError, TypeError):
            continue
        records.append({
            "id":        f"{_EXP_PREFIX}{exp_id}",
            "reg_id":    f"{_EXP_PREFIX}{exp_id}",
            "doc_type":  "experience",
            "title":     (question or "")[:100],
            "content":   answer or "",
            "edu_level": None,
            "vec":       vec,
        })

    if records:
        idx.add_items(records)
    return len(records)
