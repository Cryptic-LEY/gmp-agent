# -*- coding: utf-8 -*-
"""
E1/E3/E4/E6/E7 工具框架单元测试（不调 DashScope，不调 DB）。
"""
import pytest
from tools.registry import schemas, dispatch, get_tool, _tools
from tools.base import Tool
from tools.errors import InvalidArgsError, NotFoundError, ForbiddenError, UpstreamError
from tools.validation import validate_args


# ── E1: 自主选工具——工具注册 + schema 格式 ────────────────────────────────────

def test_e1_search_regulation_registered():
    assert get_tool("search_regulation") is not None, "search_regulation 未注册"


def test_e1_plan_learning_path_registered():
    assert get_tool("plan_learning_path") is not None, "plan_learning_path 未注册"


def test_e1_get_user_profile_registered():
    assert get_tool("get_user_profile") is not None, "get_user_profile 未注册"


def test_e1_all_builtin_tools_present():
    names = {s["function"]["name"] for s in schemas()}
    expected = {
        "search_regulation", "get_user_profile", "update_user_profile",
        "plan_learning_path", "review_assignment", "generate_courseware",
    }
    missing = expected - names
    assert not missing, f"缺少工具: {missing}"


def test_e1_schemas_openai_format():
    for s in schemas():
        assert s["type"] == "function"
        fn = s["function"]
        assert "name" in fn
        assert "description" in fn and fn["description"]
        assert "parameters" in fn


def test_e1_search_regulation_description_guides_selection():
    t = get_tool("search_regulation")
    assert t is not None
    assert "查" in t.description or "检索" in t.description or "法规" in t.description


def test_e1_plan_learning_path_description_guides_selection():
    t = get_tool("plan_learning_path")
    assert t is not None
    assert "规划" in t.description or "学习" in t.description or "路径" in t.description


# ── E3: 参数幻觉自愈——jsonschema 校验 ──────────────────────────────────────────

_QUERY_SCHEMA = {
    "type": "object",
    "properties": {"query": {"type": "string"}},
    "required": ["query"],
}


def test_e3_wrong_type_raises():
    with pytest.raises(InvalidArgsError):
        validate_args(_QUERY_SCHEMA, {"query": 123})


def test_e3_missing_required_raises():
    with pytest.raises(InvalidArgsError):
        validate_args(_QUERY_SCHEMA, {})


def test_e3_extra_field_ok():
    # JSON Schema additionalProperties default is True
    validate_args(_QUERY_SCHEMA, {"query": "洁净区", "extra": "ok"})


def test_e3_valid_args_no_error():
    validate_args(_QUERY_SCHEMA, {"query": "洁净区"})


# ── E4: 异常按类型定制——NotFound 不重试 / UpstreamError 触发退避 ─────────────────

def test_e4_error_classes_are_distinct():
    assert not issubclass(NotFoundError, UpstreamError)
    assert not issubclass(UpstreamError, NotFoundError)
    assert not issubclass(ForbiddenError, UpstreamError)


def test_e4_not_found_no_retry():
    """Handler 抛 NotFoundError → dispatch 直接传播（不重试）。"""
    call_count = [0]

    def _handler():
        call_count[0] += 1
        raise NotFoundError("资源不存在")

    _tools["_e4_nf"] = Tool(
        name="_e4_nf", description="test",
        parameters={"type": "object", "properties": {}},
        handler=_handler, level="safe",
    )
    try:
        with pytest.raises(NotFoundError):
            dispatch("_e4_nf", {})
        assert call_count[0] == 1, "NotFoundError 不应重试"
    finally:
        _tools.pop("_e4_nf", None)


def test_e4_upstream_error_no_retry_in_dispatch():
    """dispatch 不含重试逻辑——UpstreamError 单次传播（重试由 run_with_retry 在 tool_agent 层处理）。"""
    call_count = [0]

    def _handler():
        call_count[0] += 1
        raise UpstreamError("上游超时")

    _tools["_e4_ue"] = Tool(
        name="_e4_ue", description="test",
        parameters={"type": "object", "properties": {}},
        handler=_handler, level="safe",
    )
    try:
        with pytest.raises(UpstreamError):
            dispatch("_e4_ue", {})
        assert call_count[0] == 1, "dispatch 不重试，handler 只调用一次"
    finally:
        _tools.pop("_e4_ue", None)


# ── E6: safe/sensitive 分级——sensitive 未授权时被拦截 ─────────────────────────

def test_e6_sensitive_blocked_without_auth():
    with pytest.raises(ForbiddenError):
        dispatch("update_user_profile",
                 {"user_id": "u1", "patch": {}},
                 authorized=False)


def test_e6_sensitive_tools_have_correct_level():
    for name in ("update_user_profile", "review_assignment", "generate_courseware"):
        t = get_tool(name)
        assert t is not None, f"工具 {name} 未注册"
        assert t.level == "sensitive", f"工具 {name} 应为 sensitive，实为 {t.level}"


def test_e6_safe_tools_have_correct_level():
    for name in ("search_regulation", "get_user_profile", "plan_learning_path"):
        t = get_tool(name)
        assert t is not None, f"工具 {name} 未注册"
        assert t.level == "safe", f"工具 {name} 应为 safe，实为 {t.level}"


# ── E7: 步数封顶——不因循环 tool_calls 无限增长 ─────────────────────────────────

def test_e7_steps_capped_at_max():
    from agents.tool_agent import ask_agent
    from config import MAX_REASONING_STEPS

    def _handler(query: str = ""):
        return {"result": "mock"}

    _tools["_e7_mock"] = Tool(
        name="_e7_mock", description="mock infinite",
        parameters={"type": "object", "properties": {"query": {"type": "string"}}},
        handler=_handler, level="safe",
    )

    call_count = [0]

    def always_tool(messages, tools):
        call_count[0] += 1
        return {"tool_calls": [
            {"id": str(call_count[0]), "name": "_e7_mock", "args": {"query": "x"}}
        ]}

    try:
        result = ask_agent("test", llm_fn=always_tool)
        assert result["steps"] <= MAX_REASONING_STEPS, \
            f"步数 {result['steps']} 超过 MAX_REASONING_STEPS={MAX_REASONING_STEPS}"
    finally:
        _tools.pop("_e7_mock", None)
