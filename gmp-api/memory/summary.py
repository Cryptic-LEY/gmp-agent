"""近期摘要 + 工作记忆（层①③）。

方案A：摘要跨会话持久化到 MySQL user_session_summary 表，
进程重启或新会话不会丢失。
"""
from __future__ import annotations

import re

import pymysql

from config import (
    HISTORY_TURNS, SUMMARY_TRIGGER_TURNS,
    MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE,
)

# 纯闲聊：仅问候/致谢/简短答复
_SMALL_TALK_RE = re.compile(
    r'^[\s（）()【】.\-]*('
    r'你好|您好|hi|hello|hey|'
    r'谢谢|感谢|多谢|thx|thanks|谢谢你|'
    r'再见|拜拜|bye|'
    r'好的好的|好的|ok|okay|嗯|哦|哈哈|噢|'
    r'不客气|没关系|没问题|不用谢|'
    r'对|是的|是|明白|了解|清楚|知道了'
    r')[\s。！!？?…、]*$',
    re.IGNORECASE,
)


def is_small_talk(text: str) -> bool:
    """判断单条消息是否为纯闲聊（不含实质性知识问题）。"""
    return bool(_SMALL_TALK_RE.match(text.strip()))


def filter_semantic_history(history: list[dict]) -> list[dict]:
    """
    语义级短期记忆过滤：剔除纯闲聊轮次（你好/谢谢/好的/哦等）。
    以 user+assistant 为一对处理：user 是闲聊则整对删除。
    """
    filtered: list[dict] = []
    i = 0
    while i < len(history):
        msg = history[i]
        if msg.get("role") == "user":
            # 下一条是 assistant 回复（如存在）
            nxt = history[i + 1] if i + 1 < len(history) else None
            if is_small_talk(msg.get("content", "")):
                # 跳过整对
                i += 2 if nxt and nxt.get("role") == "assistant" else 1
                continue
            filtered.append(msg)
            if nxt and nxt.get("role") == "assistant":
                filtered.append(nxt)
                i += 2
            else:
                i += 1
        else:
            # 孤立 assistant 消息（奇数情况）
            if not is_small_talk(msg.get("content", "")):
                filtered.append(msg)
            i += 1
    return filtered


def should_summarize(history: list[dict]) -> bool:
    """历史消息条数 >= SUMMARY_TRIGGER_TURNS*2 时触发摘要。"""
    return len(history) >= SUMMARY_TRIGGER_TURNS * 2


def incremental_summary(
    history: list[dict],
    existing_summary: str = "",
) -> str:
    """
    增量摘要：用小模型把 history 压成简短文本。
    生产调用 DashScope；测试通过 build_window_and_summary(mock_llm=...) 绕开。
    """
    from agents.router import route_model
    from config import LLM_BASE_URL, LLM_API_KEY
    import httpx

    turns_text = "\n".join(
        f"{'用户' if m.get('role') == 'user' else '助手'}: {m.get('content', '')[:200]}"
        for m in history
    )
    if existing_summary:
        prompt = (
            f"已有摘要：{existing_summary}\n\n"
            f"新对话：\n{turns_text}\n\n"
            "请更新摘要（50字以内，保留关键信息）："
        )
    else:
        prompt = f"对话：\n{turns_text}\n\n请生成摘要（50字以内，保留关键信息）："

    resp = httpx.post(
        f"{LLM_BASE_URL}/chat/completions",
        headers={"Authorization": f"Bearer {LLM_API_KEY}"},
        json={
            "model": route_model("summarize"),
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


# ── 摘要 DB 持久化（方案A：跨会话不丢失） ────────────────────────────────────

def _get_conn():
    return pymysql.connect(
        host=MYSQL_HOST, port=MYSQL_PORT,
        user=MYSQL_USER, password=MYSQL_PASSWORD,
        database=MYSQL_DATABASE, autocommit=True,
        connect_timeout=2,
    )


def _ensure_summary_table() -> None:
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS user_session_summary (
                    user_id    VARCHAR(191) NOT NULL PRIMARY KEY,
                    summary    TEXT,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)


def load_summary(user_id: str) -> str:
    """从 MySQL 加载用户最近摘要；表不存在或无记录时返回空字符串。"""
    try:
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT summary FROM user_session_summary WHERE user_id = %s",
                    (user_id,),
                )
                row = cur.fetchone()
                return row[0] or "" if row else ""
    except Exception:
        return ""


def save_summary(user_id: str, summary: str) -> None:
    """持久化摘要（UPSERT）；失败静默降级。"""
    if not summary:
        return
    try:
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO user_session_summary (user_id, summary)
                    VALUES (%s, %s)
                    ON DUPLICATE KEY UPDATE summary = VALUES(summary)
                """, (user_id, summary))
    except Exception:
        pass


# 模块加载时幂等建表
try:
    _ensure_summary_table()
except Exception:
    pass


# ── current_state 结构化工作记忆 ──────────────────────────────────────────────

_TOPIC_EXTRACT_RE = re.compile(
    r'(?:关于|请问|什么是|如何|怎样|GMP)[：:：]?\s*([^，。？\n]{4,30})',
)


def build_current_state(history: list[dict], question: str) -> dict:
    """
    从近期对话 + 当前问题提取结构化工作记忆：
      topic    - 当前话题（从 question 中提取或用最后一个 user 消息话题）
      asked    - 已确认的问题列表（最近 user messages）
      pending  - 待确认项（尚未出现 assistant 回答的 user 问题）

    返回的 dict 键值都是简短字符串，供 format_current_state 压缩后注入 prompt。
    """
    # 提取当前话题
    m = _TOPIC_EXTRACT_RE.search(question)
    topic = m.group(1).strip() if m else question[:30].strip()

    # 从历史提取已问条目（user 消息，最近 3 条，截断 40 字）
    asked: list[str] = []
    for msg in history[-6:]:
        if msg.get("role") == "user":
            text = msg.get("content", "").strip()[:40]
            if text and text not in asked:
                asked.append(text)

    # 待确认 = 当前问题（还没回答）
    pending = [question[:40].strip()] if question.strip() else []

    return {"topic": topic, "asked": asked[-3:], "pending": pending}


def format_current_state(cs: dict) -> str:
    """把 current_state dict 压成一行 prompt 注入文本（< 80 字）。"""
    if not cs:
        return ""
    parts = [f"话题：{cs.get('topic', '')}"]
    if cs.get("asked"):
        parts.append("已问：" + "、".join(cs["asked"][-2:]))
    if cs.get("pending"):
        parts.append("当前：" + cs["pending"][0])
    return "【工作记忆】" + "；".join(parts)


def build_window_and_summary(
    history: list[dict],
    existing_summary: str = "",
    mock_llm=None,
) -> tuple[list[dict], str]:
    """
    返回 (recent_window, summary_text)：
    - 未超阈值：recent_window = filter 后全量，summary = existing_summary
    - 超阈值：older 部分压成 summary，保留最近 HISTORY_TURNS*2 条为 recent_window
    mock_llm: 可注入 (text: str) -> str，用于测试绕开 DashScope
    """
    filtered = filter_semantic_history(history)

    if not should_summarize(filtered):
        return filtered, existing_summary

    cutoff = max(0, len(filtered) - HISTORY_TURNS * 2)
    older  = filtered[:cutoff]
    recent = filtered[cutoff:]

    if older:
        turns_text = "\n".join(
            f"{'用户' if m.get('role') == 'user' else '助手'}: {m.get('content', '')[:200]}"
            for m in older
        )
        if mock_llm is not None:
            new_summary = mock_llm(turns_text)
        else:
            new_summary = incremental_summary(older, existing_summary)
    else:
        new_summary = existing_summary

    return recent, new_summary
