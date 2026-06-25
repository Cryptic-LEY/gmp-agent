"""近期摘要 + 工作记忆（层①③）。"""
from __future__ import annotations

import re

from config import HISTORY_TURNS, SUMMARY_TRIGGER_TURNS

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
