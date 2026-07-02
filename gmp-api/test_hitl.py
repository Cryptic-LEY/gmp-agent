# -*- coding: utf-8 -*-
"""
F6 HITL 挂起/放行端到端测试（不调 DashScope/DB）。
"""
import pytest
from agents.hitl import request_approval, is_approved, is_approved_for, approve, get_pending, reset
from agents.tool_agent import ask_agent
from tools.registry import _tools
from tools.base import Tool


@pytest.fixture(autouse=True)
def clean_hitl():
    """每个测试前后清理 HITL 状态，避免污染。"""
    reset()
    yield
    reset()


@pytest.fixture(autouse=True)
def mock_sensitive_handler(monkeypatch):
    """把 update_user_profile handler 替换为 mock，避免触碰 DB。"""
    if "update_user_profile" in _tools:
        monkeypatch.setattr(
            _tools["update_user_profile"], "handler",
            lambda user_id, patch: {"status": "updated"},
        )


# ── F6：基础 HITL 状态机 ─────────────────────────────────────────────────────

def test_f6_request_creates_pending():
    approval_id = request_approval("update_user_profile", {"user_id": "u1", "patch": {}})
    pending = get_pending()
    assert any(p["id"] == approval_id for p in pending)
    assert not is_approved(approval_id)


def test_f6_approve_marks_approved():
    approval_id = request_approval("update_user_profile", {"user_id": "u1", "patch": {}})
    assert not is_approved(approval_id)
    result = approve(approval_id)
    assert result is True
    assert is_approved(approval_id)


def test_f6_approve_unknown_id_returns_false():
    result = approve("nonexistent-id")
    assert result is False


def test_f6_approved_removed_from_pending():
    approval_id = request_approval("update_user_profile", {"user_id": "u1", "patch": {}})
    approve(approval_id)
    pending = get_pending()
    assert not any(p["id"] == approval_id for p in pending)


def test_f6_is_approved_for_binds_tool_name():
    """审批 ID 只对绑定的 tool_name 有效，不能用于其他工具（防越权）。"""
    approval_id_a = request_approval("update_user_profile", {"user_id": "u1", "patch": {}})
    approval_id_b = request_approval("update_user_profile", {"user_id": "u1", "patch": {}})
    approve(approval_id_a)
    approve(approval_id_b)
    assert not is_approved_for(approval_id_a, "generate_courseware")  # 其他工具被拒
    assert is_approved_for(approval_id_b, "update_user_profile")      # 正确工具通过


def test_f6_one_time_consumption():
    """审批 ID 一次性消费后不可重放（防 HITL 重放攻击）。"""
    approval_id = request_approval("update_user_profile", {"user_id": "u1", "patch": {}})
    approve(approval_id)
    assert is_approved_for(approval_id, "update_user_profile")     # 第一次通过并消费
    assert not is_approved_for(approval_id, "update_user_profile") # 第二次重放被拒


def test_f6_cross_user_replay_blocked():
    """不同用户的审批 ID 不能被其他用户使用（防跨用户重放）。"""
    approval_id = request_approval(
        "update_user_profile", {"user_id": "u1", "patch": {}}, user_id="user-001"
    )
    approve(approval_id)
    assert not is_approved_for(approval_id, "update_user_profile", user_id="user-002")
    assert is_approved_for(approval_id, "update_user_profile", user_id="user-001")


def test_f6_cross_tool_approval_blocked(monkeypatch):
    """已审批工具A的ID，不能绕过工具B的HITL审核（越权防护）。"""
    import agents.tool_agent as ta
    monkeypatch.setattr(ta, "HITL_ENABLED", True)

    # 先申请并审批工具A（review_assignment）的 ID
    approval_id_A = request_approval("review_assignment", {"submission": "test"})
    approve(approval_id_A)

    counter = [0]

    def calls_tool_b(msgs, tools):
        counter[0] += 1
        return {"tool_calls": [
            {"id": "1", "name": "generate_courseware",  # 工具B
             "args": {"topic": "洁净区"}}
        ]}

    # 携带工具A的 approval_id 尝试调用工具B → 应被挂起（工具B未授权）
    result = ask_agent("生成课件", authorized=True, llm_fn=calls_tool_b,
                       pre_approved={approval_id_A})
    assert result.get("hitl_pending") is True, "工具A的审批不应放行工具B"


# ── F6：ask_agent 集成——sensitive 工具在 HITL_ENABLED 下被挂起 ──────────────

def test_f6_ask_agent_blocks_sensitive_without_approval(monkeypatch):
    """HITL_ENABLED=True 时，sensitive 工具在未授权状态下调用被挂起。"""
    import agents.tool_agent as ta
    monkeypatch.setattr(ta, "HITL_ENABLED", True)

    counter = [0]

    def llm_calls_sensitive(msgs, tools):
        counter[0] += 1
        return {"tool_calls": [
            {"id": "1", "name": "update_user_profile",
             "args": {"user_id": "u1", "patch": {"weak_kp": ["洁净区"]}}}
        ]}

    result = ask_agent("更新我的学习档案", authorized=True, llm_fn=llm_calls_sensitive)
    assert result.get("hitl_pending") is True
    assert "approval_id" in result


def test_f6_ask_agent_executes_after_approval(monkeypatch):
    """审批后，携带 pre_approved 集合调用 → 工具被执行，返回正常 answer。"""
    import agents.tool_agent as ta
    monkeypatch.setattr(ta, "HITL_ENABLED", True)

    counter = [0]

    def llm_calls_sensitive(msgs, tools):
        counter[0] += 1
        if counter[0] == 1:
            return {"tool_calls": [
                {"id": "1", "name": "update_user_profile",
                 "args": {"user_id": "u1", "patch": {"weak_kp": ["洁净区"]}}}
            ]}
        return {"content": "已为你更新学习档案。"}

    # 第一次调用：被挂起
    result1 = ask_agent("更新我的学习档案", authorized=True, llm_fn=llm_calls_sensitive)
    assert result1.get("hitl_pending") is True
    approval_id = result1["approval_id"]

    # 审批
    approve(approval_id)

    # 第二次调用：携带 pre_approved
    counter[0] = 0
    result2 = ask_agent("更新我的学习档案", authorized=True, llm_fn=llm_calls_sensitive,
                        pre_approved={approval_id})
    assert result2.get("hitl_pending") is not True
    assert result2["answer"] != ""


def test_hitl_api_fails_closed_when_no_key(monkeypatch):
    """未配置 HITL_API_KEY 时，审批依赖函数应 raise 503（fail-closed）。"""
    from fastapi import HTTPException
    import main
    monkeypatch.setattr(main, "HITL_API_KEY", "")
    with pytest.raises(HTTPException) as exc_info:
        main._hitl_auth_dep(x_hitl_key="")
    assert exc_info.value.status_code == 503


def test_hitl_api_rejects_wrong_key(monkeypatch):
    """配置了 HITL_API_KEY 但提供错误 key 时应 raise 403。"""
    from fastapi import HTTPException
    import main
    monkeypatch.setattr(main, "HITL_API_KEY", "correct-secret")
    with pytest.raises(HTTPException) as exc_info:
        main._hitl_auth_dep(x_hitl_key="wrong-key")
    assert exc_info.value.status_code == 403


def test_hitl_api_accepts_correct_key(monkeypatch):
    """提供正确 key 时依赖函数应正常返回（不 raise）。"""
    import main
    monkeypatch.setattr(main, "HITL_API_KEY", "correct-secret")
    main._hitl_auth_dep(x_hitl_key="correct-secret")  # 不 raise 即通过


def test_f6_safe_tool_not_blocked(monkeypatch):
    """safe 工具即使 HITL_ENABLED 也不被挂起。"""
    import agents.tool_agent as ta
    monkeypatch.setattr(ta, "HITL_ENABLED", True)

    if "search_regulation" in _tools:
        monkeypatch.setattr(
            _tools["search_regulation"], "handler",
            lambda query, edu_level=None: [{"id": "REG-001", "content": "洁净区规定", "score": 0.9}],
        )

    counter = [0]

    def llm_calls_safe(msgs, tools):
        counter[0] += 1
        if counter[0] == 1:
            return {"tool_calls": [
                {"id": "1", "name": "search_regulation", "args": {"query": "洁净区"}}
            ]}
        return {"content": "洁净区分ABCD级。"}

    result = ask_agent("洁净区分级", authorized=True, llm_fn=llm_calls_safe)
    assert result.get("hitl_pending") is not True
    assert result["answer"] != ""
