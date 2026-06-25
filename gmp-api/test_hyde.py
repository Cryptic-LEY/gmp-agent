# -*- coding: utf-8 -*-
"""
01-vector-engine 子任务7：HyDE（Hypothetical Document Embeddings）单测。

默认 RAG_HYDE_ENABLED=false，测试通过 _force_enabled=True 覆盖 enabled 路径。
零 DashScope 调用：llm_fn / embed_fn 全部 mock 注入。
"""
from rag.hyde import hyde_embed


def test_hyde_disabled_returns_none_without_any_call():
    """默认 RAG_HYDE_ENABLED=False，应立即返回 None，不调用 llm_fn 或 embed_fn。"""
    called = []

    def fail_llm(q):
        called.append("llm")
        return "假设答案"

    def fail_embed(t):
        called.append("embed")
        return [0.1] * 1024

    result = hyde_embed("洁净区要求", llm_fn=fail_llm, embed_fn=fail_embed)
    assert result is None, "HyDE 关闭时应返回 None"
    assert called == [], f"HyDE 关闭时不应调用任何 fn，实际调用 {called}"


def test_hyde_enabled_returns_vector_from_mocks():
    """_force_enabled=True 时：LLM 生成假设答案 → embed → 返回向量。"""
    result = hyde_embed(
        "洁净区监测要求",
        llm_fn=lambda q: "洁净区需每班监测温湿度和悬浮粒子。",
        embed_fn=lambda t: [0.5] * 1024,
        _force_enabled=True,
    )
    assert result is not None, "HyDE 开启时应返回向量"
    assert len(result) == 1024


def test_hyde_enabled_llm_exception_returns_none():
    """LLM 抛出异常时应捕获并返回 None，不崩服务。"""
    def bad_llm(q):
        raise RuntimeError("LLM 超时")

    result = hyde_embed(
        "问题",
        llm_fn=bad_llm,
        embed_fn=lambda t: [0.1] * 1024,
        _force_enabled=True,
    )
    assert result is None, "LLM 异常时应返回 None"


def test_hyde_enabled_empty_hypothetical_returns_none():
    """LLM 返回空字符串时，不调用 embed，直接返回 None。"""
    embed_called = []

    def empty_llm(q):
        return ""

    def track_embed(t):
        embed_called.append(t)
        return [0.1] * 1024

    result = hyde_embed(
        "问题",
        llm_fn=empty_llm,
        embed_fn=track_embed,
        _force_enabled=True,
    )
    assert result is None, "空假设答案时应返回 None"
    assert embed_called == [], "空假设时不应调用 embed"


def test_hyde_enabled_embed_failure_returns_none():
    """embed_fn 返回 None 时，hyde_embed 也应返回 None。"""
    result = hyde_embed(
        "问题",
        llm_fn=lambda q: "有效的假设答案",
        embed_fn=lambda t: None,
        _force_enabled=True,
    )
    assert result is None, "embed 失败时应返回 None"
