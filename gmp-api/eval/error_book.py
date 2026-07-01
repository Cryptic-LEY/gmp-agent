"""
D6 错题本：聚合 critic 触发 / 用户负反馈 / RAGAS 低分的坏 case，
供离线对齐（few-shot 负例注入 prompt）和 SFT/DPO 语料准备。
"""
from __future__ import annotations

import pymysql

from config import (
    MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE,
)


def _get_conn():
    return pymysql.connect(
        host=MYSQL_HOST, port=MYSQL_PORT,
        user=MYSQL_USER, password=MYSQL_PASSWORD,
        database=MYSQL_DATABASE, autocommit=True,
    )


def _ensure_table() -> None:
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS error_book (
                    id         INT AUTO_INCREMENT PRIMARY KEY,
                    question   TEXT        NOT NULL,
                    bad_answer TEXT,
                    reason     VARCHAR(500),
                    fix_hint   TEXT,
                    source     VARCHAR(50) DEFAULT 'manual',
                    created_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_eb_created (created_at)
                )
            """)


def add_error(
    question: str,
    bad_answer: str,
    reason: str,
    fix_hint: str = "",
    source: str = "manual",
) -> int:
    """写入一条错题记录，返回自增 id。"""
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO error_book (question, bad_answer, reason, fix_hint, source) "
                "VALUES (%s, %s, %s, %s, %s)",
                (question, bad_answer, reason, fix_hint, source),
            )
            return cur.lastrowid


def get_recent_errors(question: str | None = None, n: int = 10) -> list[dict]:
    """
    取最近 n 条错题。
    question 非空时做精确匹配（用于测试闭环）。
    """
    with _get_conn() as conn:
        with conn.cursor() as cur:
            if question:
                cur.execute(
                    "SELECT id, question, bad_answer, reason, fix_hint, source, created_at "
                    "FROM error_book WHERE question = %s "
                    "ORDER BY created_at DESC LIMIT %s",
                    (question, n),
                )
            else:
                cur.execute(
                    "SELECT id, question, bad_answer, reason, fix_hint, source, created_at "
                    "FROM error_book ORDER BY created_at DESC LIMIT %s",
                    (n,),
                )
            rows = cur.fetchall()
    cols = ("id", "question", "bad_answer", "reason", "fix_hint", "source", "created_at")
    return [dict(zip(cols, row)) for row in rows]


def get_few_shot_negatives(question: str, n: int = 3) -> list[dict]:
    """
    返回与 question 完全匹配的历史坏 case，作为 few-shot 负例注入 prompt。
    （生产版可升级为语义搜索；当前用精确匹配确保测试闭环可断言。）
    """
    return get_recent_errors(question=question, n=n)


def aggregate_from_query_log(lookback_days: int = 7) -> int:
    """
    从 query_log 批量导入：critic_triggered=1 且最近 lookback_days 天内的记录。
    跳过已经在 error_book 中的（按 question+created_at 去重）。
    返回实际写入条数。
    """
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO error_book (question, bad_answer, reason, source, created_at)
                SELECT
                    ql.question,
                    ql.final_answer  AS bad_answer,
                    '自动聚合：Critic已触发修订' AS reason,
                    'critic'         AS source,
                    ql.timestamp
                FROM query_log ql
                WHERE ql.critic_triggered = 1
                  AND ql.timestamp >= NOW() - INTERVAL %s DAY
                  AND NOT EXISTS (
                    SELECT 1 FROM error_book eb
                    WHERE CONVERT(eb.question USING utf8mb4) = CONVERT(ql.question USING utf8mb4)
                      AND eb.source   = 'critic'
                      AND eb.created_at = ql.timestamp
                  )
            """, (lookback_days,))
            return cur.rowcount


# 模块加载时幂等建表（失败静默）
try:
    _ensure_table()
except Exception:
    pass


if __name__ == "__main__":
    import sys
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    n = aggregate_from_query_log(days)
    print(f"[error_book] 从 query_log 导入 {n} 条新记录（lookback={days}d）")
