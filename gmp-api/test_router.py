# -*- coding: utf-8 -*-
"""
02-context-perf 子任务2：agents/router.py 单测

B7  轻量任务用 LLM_MODEL_SMALL，重量任务用 LLM_MODEL_HEAVY
    tutor 节点经 route_model() 选模型（mock 断言）
"""
import pytest
from unittest.mock import patch, MagicMock
from agents.router import route_model, TaskKind


# ─── 基础路由逻辑 ─────────────────────────────────────────────────────────────

def test_generate_is_heavy():
    assert route_model("generate") != ""  # returns a model name
    from config import LLM_MODEL_HEAVY
    assert route_model("generate") == LLM_MODEL_HEAVY


def test_critique_is_heavy():
    from config import LLM_MODEL_HEAVY
    assert route_model("critique") == LLM_MODEL_HEAVY


def test_revise_is_heavy():
    from config import LLM_MODEL_HEAVY
    assert route_model("revise") == LLM_MODEL_HEAVY


def test_hyde_is_light():
    from config import LLM_MODEL_SMALL
    assert route_model("hyde") == LLM_MODEL_SMALL


def test_summarize_is_light():
    from config import LLM_MODEL_SMALL
    assert route_model("summarize") == LLM_MODEL_SMALL


def test_unknown_task_defaults_to_heavy():
    """未知任务名称安全降级到重模型，避免质量退化。"""
    from config import LLM_MODEL_HEAVY
    assert route_model("unknown_task_xyz") == LLM_MODEL_HEAVY


# ─── B7：tutor 节点使用 route_model 选模型 ────────────────────────────────────

def _fake_llm_response(messages, temperature=0.3, model=None):
    return f"[fake answer model={model}]"


def test_b7_node_generate_uses_heavy_model():
    """B7：node_generate 调用 _llm_chat 时应传入 heavy model。"""
    from config import LLM_MODEL_HEAVY
    calls: list[dict] = []

    def capture(messages, temperature=0.3, model=None):
        calls.append({"model": model})
        return "generated draft"

    import agents.tutor as tutor
    with patch.object(tutor, "_llm_chat", side_effect=capture):
        from langchain_core.messages import HumanMessage
        state = {
            "messages": [HumanMessage(content="test question")],
            "edu_level": None,
            "retrieved_docs": [],
            "draft_answer": "",
            "critic_issues": "",
            "final_answer": "",
            "query_vec": None,
            "step": 0,
        }
        tutor.node_generate(state)

    assert calls, "node_generate 没有调用 _llm_chat"
    assert calls[0]["model"] == LLM_MODEL_HEAVY, (
        f"node_generate 使用了 {calls[0]['model']}，期望 {LLM_MODEL_HEAVY}"
    )


def test_b7_node_critique_uses_heavy_model():
    """B7：node_critique LLM 校验步骤应传入 heavy model。"""
    from config import LLM_MODEL_HEAVY
    calls: list[dict] = []

    def capture(messages, temperature=0.3, model=None):
        calls.append({"model": model})
        return "PASS"

    import agents.tutor as tutor
    with patch.object(tutor, "_llm_chat", side_effect=capture):
        state = {
            "messages": [],
            "edu_level": None,
            "retrieved_docs": [
                {"id": "REG-001", "doc_type": "regulation",
                 "title": "一", "content": "条文内容"}
            ],
            "draft_answer": "some draft",
            "critic_issues": "",
            "final_answer": "",
        }
        tutor.node_critique(state)

    assert calls, "node_critique 没有调用 _llm_chat"
    assert calls[-1]["model"] == LLM_MODEL_HEAVY, (
        f"node_critique 使用了 {calls[-1]['model']}，期望 {LLM_MODEL_HEAVY}"
    )
