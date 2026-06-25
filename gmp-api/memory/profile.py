"""用户档案卡（层②）：MySQL user_profile 表，原地覆盖更新。"""
from __future__ import annotations

import json
import re
import threading
from typing import Any

import pymysql

from config import (
    MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE,
    LLM_BASE_URL, LLM_API_KEY, PROFILE_ASYNC,
)

_COLUMNS = ("edu_level", "major", "weak_kp", "goals", "prefs")
_JSON_COLS = frozenset({"weak_kp", "goals", "prefs"})


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
                CREATE TABLE IF NOT EXISTS user_profile (
                    user_id     VARCHAR(64)  PRIMARY KEY,
                    edu_level   VARCHAR(20),
                    major       VARCHAR(100),
                    weak_kp     JSON,
                    goals       JSON,
                    prefs       JSON,
                    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            """)


def get_profile(user_id: str) -> dict:
    """返回用户档案 dict；未找到返回空 dict。"""
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT edu_level, major, weak_kp, goals, prefs "
                "FROM user_profile WHERE user_id = %s",
                (user_id,),
            )
            row = cur.fetchone()
    if not row:
        return {}
    col_names = ("edu_level", "major", "weak_kp", "goals", "prefs")
    out: dict[str, Any] = {}
    for col, val in zip(col_names, row):
        if val is None:
            continue
        if col in _JSON_COLS:
            try:
                out[col] = json.loads(val) if isinstance(val, str) else val
            except (json.JSONDecodeError, TypeError):
                out[col] = {}
        else:
            out[col] = val
    return out


def upsert_profile(user_id: str, patch: dict) -> None:
    """
    原地覆盖更新：patch 中每个顶层 key 整体替换对应列（治「幽灵旧值」）。
    JSON 列整体替换，不做深度合并。
    """
    if not patch:
        return
    cols = [c for c in _COLUMNS if c in patch]
    if not cols:
        return

    values: list[Any] = []
    for col in cols:
        val = patch[col]
        if col in _JSON_COLS and not isinstance(val, str):
            val = json.dumps(val, ensure_ascii=False)
        values.append(val)

    set_clause = ", ".join(f"{c} = %s" for c in cols)
    insert_cols = ", ".join(cols)
    placeholders = ", ".join(["%s"] * len(cols))

    sql = (
        f"INSERT INTO user_profile (user_id, {insert_cols}) "
        f"VALUES (%s, {placeholders}) "
        f"ON DUPLICATE KEY UPDATE {set_clause}"
    )
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, [user_id] + values + values)


def get_profile_hint(profile: dict) -> str:
    """把档案压成一行，注入系统提示。空档案返回空字符串。"""
    if not profile:
        return ""
    parts: list[str] = []
    if profile.get("edu_level"):
        edu = profile["edu_level"]
        major = profile.get("major") or ""
        label = f"{edu}·{major}" if major else edu
        parts.append(f"学生：{label}")
    if profile.get("weak_kp"):
        weak = profile["weak_kp"]
        if isinstance(weak, list) and weak:
            parts.append(f"薄弱：{'/'.join(str(k) for k in weak[:3])}")
        elif isinstance(weak, str) and weak:
            parts.append(f"薄弱：{weak}")
    if profile.get("goals"):
        goals = profile["goals"]
        if isinstance(goals, list) and goals:
            parts.append(f"目标：{goals[0]}")
        elif isinstance(goals, str) and goals:
            parts.append(f"目标：{goals}")
    return "，".join(parts)


# ── 异步实体抽取 ──────────────────────────────────────────────────────────────

def _async_extract_and_upsert(question: str, answer: str, user_id: str) -> None:
    """后台线程：小模型抽取实体 → upsert_profile。绝不阻塞主响应。"""
    from agents.router import route_model
    import httpx

    prompt = (
        "从以下对话中提取学生信息（JSON格式，只输出JSON）：\n"
        f"学生问：{question!r}\n"
        f"助手答（节选）：{answer[:300]!r}\n\n"
        "请返回能从对话推断出的信息（不确定不填）：\n"
        '{"edu_level":"专科|本科|null","major":"专业名|null",'
        '"weak_kp":["薄弱知识点"],"goals":["学习目标"]}'
    )
    try:
        resp = httpx.post(
            f"{LLM_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {LLM_API_KEY}"},
            json={
                "model": route_model("extract"),
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
            },
            timeout=30,
        )
        resp.raise_for_status()
        text = resp.json()["choices"][0]["message"]["content"]
        m = re.search(r'\{.*\}', text, re.DOTALL)
        if m:
            data = json.loads(m.group())
            patch = {
                k: v for k, v in data.items()
                if v is not None and v != "null" and v != [] and v
            }
            if patch:
                upsert_profile(user_id, patch)
    except Exception:
        pass  # 后台失败静默降级


def extract_entities_async(
    question: str, answer: str, user_id: str
) -> threading.Thread:
    """Fire-and-forget 后台实体抽取线程，立即返回。"""
    t = threading.Thread(
        target=_async_extract_and_upsert,
        args=(question, answer, user_id),
        daemon=True,
    )
    t.start()
    return t


# 模块加载时幂等建表（失败静默）
try:
    _ensure_table()
except Exception:
    pass
