"""
链路日志模块（P2-1）。
每次问答完成后写入 SQLite query_log 表，供后续问题定位和坏case回流使用。
"""
import json
import sqlite3
import time
from datetime import datetime

from config import DB_PATH


def _ensure_log_table(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS query_log (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp     TEXT    NOT NULL,
            question      TEXT    NOT NULL,
            edu_level     TEXT,
            retrieved_ids TEXT,        -- JSON 数组
            draft_answer  TEXT,
            critic_triggered INTEGER,  -- 0 / 1
            final_answer  TEXT,
            latency_ms    INTEGER
        )
    """)
    conn.commit()


def log_query(
    question: str,
    edu_level: str | None,
    retrieved_ids: list[str],
    draft_answer: str,
    critic_triggered: bool,
    final_answer: str,
    latency_ms: int,
) -> None:
    """写一条问答日志，失败时静默忽略（不能让日志影响主流程）。"""
    try:
        conn = sqlite3.connect(DB_PATH)
        _ensure_log_table(conn)
        conn.execute(
            """INSERT INTO query_log
               (timestamp, question, edu_level, retrieved_ids,
                draft_answer, critic_triggered, final_answer, latency_ms)
               VALUES (?,?,?,?,?,?,?,?)""",
            (
                datetime.utcnow().isoformat(timespec='seconds'),
                question,
                edu_level,
                json.dumps(retrieved_ids, ensure_ascii=False),
                draft_answer,
                int(critic_triggered),
                final_answer,
                latency_ms,
            ),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass
