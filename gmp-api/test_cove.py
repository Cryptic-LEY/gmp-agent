# -*- coding: utf-8 -*-
"""D5: CoVe 在线纠错单元测试（注入 mock LLM，不调 DashScope）。"""
import pytest
from agents.tutor import _cove_verify


def test_cove_detects_temperature_contradiction():
    """CoVe 发现草稿中温度声明与参考资料矛盾 → 返回非空 issues。"""
    context = "A级洁净区温度应控制在20-25摄氏度之间，相对湿度45-60%。"
    bad_draft = "根据GMP要求，A级洁净区温度应保持在60摄氏度以上，以确保灭菌效果。"
    issues = _cove_verify(
        bad_draft, context,
        llm_fn=lambda prompt: "矛盾：草稿声称温度≥60°C，但资料明确要求20-25°C。"
    )
    assert issues != "", "CoVe 应检出温度矛盾"
    assert "矛盾" in issues or "不符" in issues or "错误" in issues


def test_cove_passes_consistent_draft():
    """CoVe 发现草稿与资料一致 → 返回空字符串（不触发 revise）。"""
    context = "A级洁净区温度应控制在20-25摄氏度之间。"
    good_draft = "A级洁净区温度控制在20-25摄氏度，符合GMP要求。"
    issues = _cove_verify(
        good_draft, context,
        llm_fn=lambda prompt: "VERIFIED"
    )
    assert issues == "", f"一致草稿不应触发CoVe，得: {issues}"


def test_cove_verified_prefix_case_insensitive():
    """VERIFIED 回复不区分大小写均视为通过。"""
    issues = _cove_verify(
        "任意草稿", "任意上下文",
        llm_fn=lambda prompt: "verified"
    )
    assert issues == ""


def test_cove_empty_context_skip():
    """context 为空时 CoVe 直接跳过（返回空字符串），不调用 LLM。"""
    called = [False]

    def mock_llm(prompt):
        called[0] = True
        return "VERIFIED"

    issues = _cove_verify("草稿内容", "", llm_fn=mock_llm)
    assert issues == "", "空 context 下 CoVe 应跳过"
    assert not called[0], "空 context 下不应调用 LLM"


def test_cove_empty_draft_skip():
    """draft 为空时 CoVe 直接跳过。"""
    issues = _cove_verify("", "参考资料内容", llm_fn=lambda p: "VERIFIED")
    assert issues == ""


def test_cove_triggers_revise_in_node_critique(monkeypatch):
    """node_critique 在 COVE_ENABLED=True 时，CoVe 检出矛盾 → critic_issues 非空。"""
    import agents.tutor as tutor_mod
    monkeypatch.setattr(tutor_mod, "COVE_ENABLED", True)

    from agents.tutor import node_critique

    state = {
        "retrieved_docs": [
            {
                "id": "REG-GMP2010-A001",
                "doc_type": "regulation",
                "title": "第一条",
                "content": "A级洁净区温度应控制在20-25摄氏度之间。",
                "score": 0.9,
            }
        ],
        "draft_answer": "A级洁净区温度应保持在60摄氏度以上。",
        "messages": [],
    }

    def mock_cove(draft, context, llm_fn=None):
        return "CoVe：温度要求矛盾，草稿错误。"

    monkeypatch.setattr("agents.tutor._cove_verify", mock_cove)
    # 同时 mock LLM critic 令其 PASS（让 CoVe 有机会运行）
    monkeypatch.setattr("agents.tutor._llm_chat", lambda msgs, **kw: "PASS")

    result = node_critique(state)
    assert result["critic_issues"] != "", "CoVe 触发时 critic_issues 应非空"


def test_cove_disabled_skips_verify(monkeypatch):
    """COVE_ENABLED=False 时 CoVe 不运行，即使草稿有矛盾。"""
    import agents.tutor as tutor_mod
    monkeypatch.setattr(tutor_mod, "COVE_ENABLED", False)

    from agents.tutor import node_critique

    state = {
        "retrieved_docs": [
            {
                "id": "REG-TEST-001",
                "doc_type": "regulation",
                "title": "测试",
                "content": "温度应控制在20-25摄氏度。",
                "score": 0.9,
            }
        ],
        "draft_answer": "温度应保持在60摄氏度以上。",
        "messages": [],
    }

    called = [False]

    def mock_cove(draft, context, llm_fn=None):
        called[0] = True
        return "矛盾"

    monkeypatch.setattr("agents.tutor._cove_verify", mock_cove)
    monkeypatch.setattr("agents.tutor._llm_chat", lambda msgs, **kw: "PASS")

    node_critique(state)
    assert not called[0], "COVE_ENABLED=False 时不应调用 _cove_verify"
