"""命中率监控（C7）：memory_usage 表写入与统计。"""
from __future__ import annotations

import json


def _get_conn():
    from config import MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
    import pymysql
    return pymysql.connect(
        host=MYSQL_HOST, port=MYSQL_PORT,
        user=MYSQL_USER, password=MYSQL_PASSWORD,
        database=MYSQL_DATABASE, autocommit=True,
    )


def _ensure_table() -> None:
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS memory_usage (
                    id                INT AUTO_INCREMENT PRIMARY KEY,
                    user_id           VARCHAR(64),
                    session_id        VARCHAR(64),
                    injected_entities JSON,
                    answer_used       TINYINT(1) DEFAULT 0,
                    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_mu_user_id (user_id)
                )
            """)


def _entities_used_in_answer(entities: list[str], answer: str) -> bool:
    """启发式：注入实体中至少一个（长度>1）出现在答案里。"""
    answer_lower = answer.lower()
    return any(e.lower() in answer_lower for e in entities if len(e) > 1)


def log_memory_usage(
    user_id: str,
    injected_entities: list[str],
    answer: str,
    session_id: str = "",
) -> None:
    """写入 memory_usage 记录；失败静默降级，不影响主流程。"""
    used = _entities_used_in_answer(injected_entities, answer)
    try:
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO memory_usage "
                    "(user_id, session_id, injected_entities, answer_used) "
                    "VALUES (%s, %s, %s, %s)",
                    (
                        user_id,
                        session_id,
                        json.dumps(injected_entities, ensure_ascii=False),
                        int(used),
                    ),
                )
    except Exception:
        pass


def get_hit_rate(user_id: str | None = None) -> float:
    """返回注入记忆命中率（被答案用到的比例）；无数据返回 0.0。"""
    try:
        with _get_conn() as conn:
            with conn.cursor() as cur:
                if user_id:
                    cur.execute(
                        "SELECT SUM(answer_used), COUNT(*) "
                        "FROM memory_usage WHERE user_id = %s",
                        (user_id,),
                    )
                else:
                    cur.execute(
                        "SELECT SUM(answer_used), COUNT(*) FROM memory_usage"
                    )
                row = cur.fetchone()
        if not row or not row[1]:
            return 0.0
        return float(row[0] or 0) / float(row[1])
    except Exception:
        return 0.0


try:
    _ensure_table()
except Exception:
    pass
