"""
链路日志模块（P2-1）。
每次问答完成后写入 MySQL query_log 表，供后续问题定位和坏case回流使用。
"""
import json

import pymysql

from config import MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE


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
        conn = pymysql.connect(
            host=MYSQL_HOST, port=MYSQL_PORT,
            user=MYSQL_USER, password=MYSQL_PASSWORD,
            database=MYSQL_DATABASE, charset='utf8mb4',
        )
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS query_log (
                        id               INT AUTO_INCREMENT PRIMARY KEY,
                        timestamp        DATETIME(3) NOT NULL,
                        question         TEXT NOT NULL,
                        edu_level        VARCHAR(64),
                        retrieved_ids    TEXT,
                        draft_answer     TEXT,
                        critic_triggered TINYINT(1) NOT NULL DEFAULT 0,
                        final_answer     TEXT,
                        latency_ms       INT
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)
                # 用 MySQL 服务器时钟 NOW(3)，与 error_book 等表的 CURRENT_TIMESTAMP 统一；
                # 旧实现写 Python datetime.utcnow() 会与本地时区默认列混用，导致排序/窗口错乱。
                cur.execute(
                    """INSERT INTO query_log
                       (timestamp, question, edu_level, retrieved_ids,
                        draft_answer, critic_triggered, final_answer, latency_ms)
                       VALUES (NOW(3),%s,%s,%s,%s,%s,%s,%s)""",
                    (
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
    except Exception:
        pass
