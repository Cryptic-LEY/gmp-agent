"""
HyDE（Hypothetical Document Embeddings）：默认关闭。

流程（启用时）：
  1. 用小模型对问题生成「假设答案」（2-3 句 GMP 专业段落）
  2. 对假设答案做 embedding
  3. 用该向量替代原始问题向量做检索

开关：RAG_HYDE_ENABLED（默认 false）。
llm_fn / embed_fn 可注入用于单测，None 时调用真实 DashScope。
"""
from typing import Callable

import httpx

from config import (
    RAG_HYDE_ENABLED,
    DASHSCOPE_BASE_URL, DASHSCOPE_API_KEY,
    HYDE_LLM_MODEL, EMB_BASE_URL, EMB_API_KEY, EMB_MODEL,
)

_HYDE_SYSTEM = (
    "你是一位 GMP（药品生产质量管理规范）专家。"
    "请根据用户提问，用 2-3 句话生成一段可能包含答案的专业段落，"
    "语言简洁准确，不要提及「根据您的问题」等引导词。"
)


def _call_llm(question: str) -> str:
    """调用 DashScope chat 生成假设答案；失败返回空字符串。"""
    if not DASHSCOPE_API_KEY:
        return ""
    try:
        resp = httpx.post(
            f"{DASHSCOPE_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {DASHSCOPE_API_KEY}"},
            json={
                "model": HYDE_LLM_MODEL,  # 轻量模型，与主问答 LLM 分开
                "messages": [
                    {"role": "system", "content": _HYDE_SYSTEM},
                    {"role": "user", "content": question},
                ],
                "max_tokens": 256,
            },
            timeout=20,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        return ""


def _embed_text(text: str) -> list[float] | None:
    """调用 DashScope embedding；失败返回 None。"""
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


def hyde_embed(
    question: str,
    *,
    llm_fn: Callable[[str], str] | None = None,
    embed_fn: Callable[[str], list[float] | None] | None = None,
    _force_enabled: bool = False,  # 仅单测使用，严禁生产调用方传此参数
) -> list[float] | None:
    """
    生成假设答案并嵌入，返回向量供检索使用。

    RAG_HYDE_ENABLED=False（默认）时立即返回 None，调用方降级到直接嵌入问题。
    """
    if not (_force_enabled or RAG_HYDE_ENABLED):
        return None

    do_llm = llm_fn or _call_llm
    do_embed = embed_fn or _embed_text

    try:
        hypothesis = do_llm(question)
        if not hypothesis:
            return None
        return do_embed(hypothesis)
    except Exception:
        return None
