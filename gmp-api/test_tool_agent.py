# -*- coding: utf-8 -*-
"""
E2/E5 多工具编排 + 7 步 FC 闭环（注入 mock LLM，不调 DashScope/DB）。
"""
import pytest
from tools.registry import _tools
from tools.base import Tool
from agents.tool_agent import ask_agent


# ── 辅助：为每个测试临时注入 mock handler，避免触碰真实 DB/LLM ─────────────────

@pytest.fixture(autouse=True)
def mock_builtin_handlers(monkeypatch):
    """把内置工具的 handler 替换为轻量 mock，避免测试调用 MySQL/DashScope。"""
    mocks = {
        "get_user_profile": lambda user_id: {
            "profile": {"edu_level": "本科", "major": "药学", "weak_kp": ["洁净区分级"]},
            "hint": "本科·药学，薄弱：洁净区分级",
        },
        "plan_learning_path": lambda user_id, goal: {
            "user_id": user_id,
            "plan": ["重点复习洁净区分级", "实践片剂车间监测", f"目标：{goal}"],
            "major": "药学",
        },
        "search_regulation": lambda query, edu_level=None: [
            {"id": "REG-GMP2010-A001", "content": "洁净区分A、B、C、D四个级别。", "score": 0.95}
        ],
        "update_user_profile": lambda user_id, patch: {"status": "updated"},
        "review_assignment": lambda submission, question=None: {
            "score": 85, "feedback": "回答基本正确，注意A级温度要求。"
        },
        "generate_courseware": lambda topic, edu_level=None: {
            "title": topic, "content": f"关于{topic}的课件内容..."
        },
    }
    for name, mock_fn in mocks.items():
        if name in _tools:
            monkeypatch.setattr(_tools[name], "handler", mock_fn)


# ── E2: 多工具编排——依次调用 get_user_profile → plan_learning_path ─────────────

def test_e2_multi_step_correct_sequence():
    """mock LLM 按顺序返回两个工具调用，验证 tool_calls_log 顺序正确。"""
    sequence = [
        {"tool_calls": [{"id": "1", "name": "get_user_profile", "args": {"user_id": "u1"}}]},
        {"tool_calls": [{"id": "2", "name": "plan_learning_path",
                          "args": {"user_id": "u1", "goal": "洁净区分级"}}]},
        {"content": "已根据你的画像规划了洁净区分级学习路径。"},
    ]
    idx = [0]

    def seq_llm(messages, tools):
        r = sequence[min(idx[0], len(sequence) - 1)]
        idx[0] += 1
        return r

    result = ask_agent("我洁净区总错，帮我规划", user_id="u1", llm_fn=seq_llm)
    names = [t["name"] for t in result["tool_calls_log"]]
    assert "get_user_profile" in names
    assert "plan_learning_path" in names
    assert names.index("get_user_profile") < names.index("plan_learning_path"), \
        "get_user_profile 应在 plan_learning_path 之前执行"


def test_e2_at_least_two_tool_steps():
    sequence = [
        {"tool_calls": [{"id": "1", "name": "get_user_profile", "args": {"user_id": "u1"}}]},
        {"tool_calls": [{"id": "2", "name": "plan_learning_path",
                          "args": {"user_id": "u1", "goal": "洁净区"}}]},
        {"content": "完成。"},
    ]
    idx = [0]
    seq_llm = lambda msgs, tools: (lambda r: (idx.__setitem__(0, idx[0]+1), r)[1])(
        sequence[min(idx[0], len(sequence)-1)]
    )
    result = ask_agent("帮我规划", user_id="u1", llm_fn=seq_llm)
    assert len(result["tool_calls_log"]) >= 2


def test_e2_final_answer_non_empty():
    sequence = [
        {"tool_calls": [{"id": "1", "name": "get_user_profile", "args": {"user_id": "u1"}}]},
        {"content": "已分析你的学习画像。"},
    ]
    idx = [0]

    def seq_llm(messages, tools):
        r = sequence[min(idx[0], len(sequence) - 1)]
        idx[0] += 1
        return r

    result = ask_agent("帮我规划", user_id="u1", llm_fn=seq_llm)
    assert result["answer"] != ""


# ── E5: 7 步 FC 闭环——工具真实返回数据被回灌给模型 ─────────────────────────────

def test_e5_tool_result_fed_back_to_llm():
    """工具结果（REG-GMP2010-A001）应出现在后续 LLM 调用的 messages 中。"""
    data_seen = [False]
    idx = [0]

    def tracking_llm(messages, tools):
        idx[0] += 1
        if idx[0] > 1:
            # Check if tool result is in messages
            for m in messages:
                content = ""
                if isinstance(m, dict):
                    content = m.get("content", "") or ""
                elif hasattr(m, "content"):
                    content = m.content or ""
                if "REG-GMP2010-A001" in content:
                    data_seen[0] = True
        if idx[0] == 1:
            return {"tool_calls": [
                {"id": "tc1", "name": "search_regulation", "args": {"query": "洁净区"}}
            ]}
        return {"content": "根据检索结果，洁净区分A、B、C、D四个级别。"}

    result = ask_agent("洁净区分级", llm_fn=tracking_llm)
    assert data_seen[0], "工具返回数据应被回灌给 LLM（messages 中应含 REG-GMP2010-A001）"


def test_e5_full_loop_returns_answer():
    """7 步完整闭环：最终 answer 非空。"""
    idx = [0]

    def seq_llm(messages, tools):
        idx[0] += 1
        if idx[0] == 1:
            return {"tool_calls": [
                {"id": "1", "name": "search_regulation", "args": {"query": "洁净区"}}
            ]}
        return {"content": "洁净区按GMP要求分为A、B、C、D四个级别，A级最高。"}

    result = ask_agent("洁净区分级", llm_fn=seq_llm)
    assert result["answer"] and len(result["answer"]) > 0
    assert result["steps"] >= 2  # 至少：call_llm → dispatch → call_llm


def test_e5_tool_calls_logged():
    """ask_agent 返回的 tool_calls_log 应记录每次工具调用。"""
    idx = [0]

    def seq_llm(messages, tools):
        idx[0] += 1
        if idx[0] == 1:
            return {"tool_calls": [
                {"id": "1", "name": "search_regulation", "args": {"query": "洁净区"}}
            ]}
        return {"content": "找到相关条款。"}

    result = ask_agent("洁净区", llm_fn=seq_llm)
    assert len(result["tool_calls_log"]) >= 1
    assert result["tool_calls_log"][0]["name"] == "search_regulation"


# ── E3 补充：agent 层 TOOL_ARG_RETRY 上限 ────────────────────────────────────

def test_e3_arg_retry_limit_gives_up():
    """
    LLM 持续给错误参数 → agent 最终出现"放弃"信号：
    或来自 TOOL_ARG_RETRY 上限（超过最大重试次数），
    或来自 GuardRail 循环检测（同一工具相同 args 达到 GUARD_REPEAT_LIMIT）。
    两者都是正确的防死循环行为，测试接受任意一种。
    """
    from config import TOOL_ARG_RETRY, GUARD_REPEAT_LIMIT

    def _handler(query: str = ""):
        return {"result": query}

    _tools["_e3_strict"] = Tool(
        name="_e3_strict", description="strict schema test",
        parameters={"type": "object", "properties": {"query": {"type": "string"}},
                    "required": ["query"]},
        handler=_handler, level="safe",
    )

    _GIVE_UP_SIGNALS = ("超过最大重试次数", "循环警告", "切换思路", "重复调用")
    abandon_seen = [False]
    idx = [0]

    def bad_args_llm(messages, tools):
        idx[0] += 1
        for m in messages:
            content = m.get("content") or ""
            if any(sig in content for sig in _GIVE_UP_SIGNALS):
                abandon_seen[0] = True
        limit = max(TOOL_ARG_RETRY, GUARD_REPEAT_LIMIT) + 2
        if idx[0] <= limit:
            return {"tool_calls": [
                {"id": str(idx[0]), "name": "_e3_strict", "args": {"query": 999}}
            ]}
        return {"content": "已放弃该工具。"}

    try:
        result = ask_agent("test arg retry", llm_fn=bad_args_llm)
        assert abandon_seen[0], "持续给错误参数后 agent 应注入放弃信号"
    finally:
        _tools.pop("_e3_strict", None)


def test_e3_exhausted_tool_disabled_and_no_false_success():
    """arg-retry 耗尽后：① 该工具 schema 不再发给 LLM（程序层确定性禁用）；
    ② 注入'不得谎称成功'系统约束。用变化的非法参数，确保走 arg-retry 而非 GuardRail 重复检测。"""
    _tools["_e3_disable"] = Tool(
        name="_e3_disable", description="strict",
        parameters={"type": "object", "properties": {"query": {"type": "string"}},
                    "required": ["query"]},
        handler=lambda query="": {"ok": query}, level="safe",
    )
    try:
        seen_tool_names: list[set] = []
        constraint_seen = [False]
        idx = [0]

        def llm(messages, tools):
            idx[0] += 1
            names = {t["function"]["name"] for t in tools}
            seen_tool_names.append(names)
            for m in messages:
                c = m.get("content") or ""
                if "不得声称" in c or "已停用" in c:
                    constraint_seen[0] = True
            if "_e3_disable" in names:
                # 每轮不同的非法参数（缺 required query，且 hash 不同→绕开 GuardRail 重复检测）
                return {"tool_calls": [
                    {"id": str(idx[0]), "name": "_e3_disable", "args": {"junk": idx[0]}}
                ]}
            return {"content": "该操作无法完成，请补充主题后重试。"}

        ask_agent("触发耗尽", llm_fn=llm)

        assert constraint_seen[0], "耗尽后应注入'不得谎称成功/已停用'系统约束"
        assert "_e3_disable" not in seen_tool_names[-1], \
            "禁用后最后一轮不应再把该工具 schema 发给 LLM"
        assert any("_e3_disable" not in s for s in seen_tool_names), \
            "禁用应在某轮后持久生效（schema 被移除）"
    finally:
        _tools.pop("_e3_disable", None)


def test_e3_exhausted_tool_cannot_fabricate_success():
    """对抗测试：工具停用后模型故意撒谎说'成功'，且全程无任何工具成功执行 →
    程序必须硬覆盖终答为如实失败（status=tool_failed），不能原样返回谎报文本。"""
    handler_calls = [0]

    def _handler(query: str = ""):
        handler_calls[0] += 1
        return {"ok": query}

    _tools["_e3_liar"] = Tool(
        name="_e3_liar", description="strict",
        parameters={"type": "object", "properties": {"query": {"type": "string"}},
                    "required": ["query"]},
        handler=_handler, level="safe",
    )
    try:
        idx = [0]

        def lying_llm(messages, tools):
            idx[0] += 1
            names = {t["function"]["name"] for t in tools}
            if "_e3_liar" in names:
                # 变化的非法参数 → 触发 arg-retry 耗尽而非 GuardRail 重复检测
                return {"tool_calls": [
                    {"id": str(idx[0]), "name": "_e3_liar", "args": {"junk": idx[0]}}
                ]}
            # 工具被移除后，模型无视约束，撒谎说成功
            return {"content": "SUCCESS：所需操作已成功完成。"}

        result = ask_agent("更新我的画像", llm_fn=lying_llm)

        assert result.get("status") == "tool_failed", f"应硬判失败，实际 {result}"
        assert "SUCCESS" not in result["answer"], "不得原样返回模型的谎报文本"
        assert "成功" not in result["answer"], f"终答不得声称成功：{result['answer']}"
        assert handler_calls[0] == 0, "工具从未成功执行"
        assert "_e3_liar" in result.get("failed_tools", []), "应记录失败工具"
    finally:
        _tools.pop("_e3_liar", None)


def test_e3_partial_failure_when_needed_tool_fails(monkeypatch):
    """漏洞一：辅助工具(查询)成功不得掩盖真正需要的工具(更新)失败。
    查询成功 + 更新参数耗尽 + 模型谎称更新成功 → 必须 partial_failure，不得整体成功文本。"""
    import agents.tool_agent as ta
    monkeypatch.setattr(ta, "MAX_REASONING_STEPS", 10)
    calls = {"q": 0, "u": 0}
    _tools["_e3_q"] = Tool(
        name="_e3_q", description="query",
        parameters={"type": "object", "properties": {"x": {"type": "string"}}},
        handler=lambda x="": (calls.__setitem__("q", calls["q"] + 1), {"profile": "data"})[1],
        level="safe",
    )
    _tools["_e3_u"] = Tool(
        name="_e3_u", description="update",
        parameters={"type": "object", "properties": {"patch": {"type": "object"}}, "required": ["patch"]},
        handler=lambda patch=None: (calls.__setitem__("u", calls["u"] + 1), {"ok": True})[1],
        level="safe",
    )
    try:
        idx = [0]

        def llm(messages, tools):
            idx[0] += 1
            names = {t["function"]["name"] for t in tools}
            if idx[0] == 1:
                return {"tool_calls": [{"id": "q1", "name": "_e3_q", "args": {"x": "me"}}]}
            if "_e3_u" in names:
                return {"tool_calls": [{"id": f"u{idx[0]}", "name": "_e3_u", "args": {"junk": idx[0]}}]}
            return {"content": "SUCCESS：你的画像已成功更新。"}

        result = ask_agent("更新我的画像", llm_fn=llm)
        assert result["status"] == "partial_failure", result
        assert "SUCCESS" not in result["answer"] and "成功" not in result["answer"], result["answer"]
        assert "_e3_u" in result["failed_tools"], result
        assert "_e3_q" in result["executed_tools"], result
        assert calls["u"] == 0, "更新工具从未成功执行"
        assert calls["q"] == 1
    finally:
        _tools.pop("_e3_q", None)
        _tools.pop("_e3_u", None)


def test_e3_handler_error_blocks_false_success():
    """漏洞二：handler 抛 NotFound 等异常也算失败。模型随后谎称成功 → 必须 tool_failed。"""
    from tools.errors import NotFoundError

    def _boom(query: str = ""):
        raise NotFoundError("资源不存在")

    _tools["_e3_boom"] = Tool(
        name="_e3_boom", description="boom",
        parameters={"type": "object", "properties": {"query": {"type": "string"}}},
        handler=_boom, level="safe",
    )
    try:
        idx = [0]

        def llm(messages, tools):
            idx[0] += 1
            if idx[0] == 1:
                return {"tool_calls": [{"id": "1", "name": "_e3_boom", "args": {"query": "x"}}]}
            return {"content": "SUCCESS：操作已成功完成。"}

        result = ask_agent("执行操作", llm_fn=llm)
        assert result["status"] == "tool_failed", result
        assert "SUCCESS" not in result["answer"] and "成功" not in result["answer"], result["answer"]
        assert "_e3_boom" in result["failed_tools"], result
    finally:
        _tools.pop("_e3_boom", None)


def test_e3_success_then_failure_not_masked(monkeypatch):
    """漏洞一：同一工具先成功后失败，后一次失败不得被历史成功掩盖。"""
    import agents.tool_agent as ta
    monkeypatch.setattr(ta, "MAX_REASONING_STEPS", 10)
    from tools.errors import NotFoundError
    state = {"n": 0}

    def _flaky(query: str = ""):
        state["n"] += 1
        if state["n"] == 1:
            return {"ok": True}          # 第一次成功
        raise NotFoundError("资源在第二次调用时消失")  # 第二次失败

    _tools["_e3_flaky"] = Tool(
        name="_e3_flaky", description="flaky",
        parameters={"type": "object", "properties": {"query": {"type": "string"}}},
        handler=_flaky, level="safe",
    )
    try:
        idx = [0]

        def llm(messages, tools):
            idx[0] += 1
            if idx[0] <= 2:
                return {"tool_calls": [{"id": str(idx[0]), "name": "_e3_flaky", "args": {"query": "x"}}]}
            return {"content": "SUCCESS：两次操作都已成功完成。"}

        result = ask_agent("执行两次", llm_fn=llm)
        assert result["status"] != "ok", f"后一次失败不应被历史成功掩盖：{result}"
        assert "SUCCESS" not in result["answer"] and "成功" not in result["answer"], result["answer"]
        assert "_e3_flaky" in result["failed_tools"], result
    finally:
        _tools.pop("_e3_flaky", None)


def test_e3_unregistered_tool_blocks_false_success():
    """漏洞二：模型调用未注册工具后谎称成功 → 必须记失败并 tool_failed。"""
    idx = [0]

    def llm(messages, tools):
        idx[0] += 1
        if idx[0] == 1:
            return {"tool_calls": [{"id": "1", "name": "_e3_ghost_tool", "args": {}}]}
        return {"content": "SUCCESS：不存在的操作已成功完成。"}

    result = ask_agent("调用幽灵工具", llm_fn=llm)
    assert result["status"] == "tool_failed", result
    assert "SUCCESS" not in result["answer"] and "成功" not in result["answer"], result["answer"]
    assert "_e3_ghost_tool" in result["failed_tools"], result


def test_e3_no_tool_executed_flagged():
    """无目标绑定的 agent 任务，模型全程不调用任何工具 → status=no_tool_executed（暴露无执行证据）。"""
    def llm(messages, tools):
        return {"content": "这是一段没有调用工具的普通回答。"}

    # 用不触发目标绑定的问题（无「更新画像/生成课件/批改/规划」等动作词）
    result = ask_agent("随便聊聊洁净区吧", llm_fn=llm)
    assert result["status"] == "no_tool_executed", result
    assert result["executed_tools"] == [], result
    assert result["failed_tools"] == [], result


def test_e3_readonly_tool_success_is_not_goal_evidence():
    """漏洞一：只读辅助工具成功 ≠ 完成用户目标。'更新画像'目标须 update_user_profile 成功。"""
    _tools["_audit_read"] = Tool(
        name="_audit_read", description="read helper",
        parameters={"type": "object", "properties": {"x": {"type": "string"}}},
        handler=lambda x="": {"data": "ok"}, level="safe",
    )
    try:
        idx = [0]

        def llm(messages, tools):
            idx[0] += 1
            if idx[0] == 1:
                return {"tool_calls": [{"id": "1", "name": "_audit_read", "args": {"x": "y"}}]}
            return {"content": "SUCCESS：你的画像已更新。"}

        result = ask_agent("帮我更新画像", llm_fn=llm)
        assert result["status"] == "partial_failure", result
        assert "update_user_profile" in result["unmet_required_tools"], result
        assert "SUCCESS" not in result["answer"] and "成功" not in result["answer"], result["answer"]
        assert "_audit_read" in result["executed_tools"], result
    finally:
        _tools.pop("_audit_read", None)


def test_e3_goal_unmet_when_no_tool_called():
    """漏洞二落地：'更新画像'目标但全程不调工具 + 谎称成功 → 目标未达，覆盖为 tool_failed。"""
    def llm(messages, tools):
        return {"content": "SUCCESS：画像已更新。"}

    result = ask_agent("帮我更新画像", llm_fn=llm)
    assert result["status"] == "tool_failed", result
    assert "update_user_profile" in result["unmet_required_tools"], result
    assert "SUCCESS" not in result["answer"] and "成功" not in result["answer"], result["answer"]


def test_e3_clarifying_question_is_needs_input_not_failure():
    """合法追问：目标信息不足时模型正常追问（未声称完成）→ needs_input，保留追问文本，
    不得误判为 tool_failed（对齐 spec「模糊需求 agent 自主补全」）。"""
    def llm(messages, tools):
        return {"content": "请问你想把画像更新成什么？请提供学历、专业或薄弱知识点。"}

    result = ask_agent("帮我更新画像", llm_fn=llm)
    assert result["status"] == "needs_input", result
    # 保留模型的具体追问，不覆盖
    assert "请提供" in result["answer"], result["answer"]
    assert "update_user_profile" in result["unmet_required_tools"], result


def test_e3_handler_returns_failure_dict_recorded_as_failure():
    """工具契约兜底：handler 用返回值(ok=false/error)表达业务失败而非抛异常 → 仍判为失败。"""
    _tools["_e3_softfail"] = Tool(
        name="_e3_softfail", description="soft fail",
        parameters={"type": "object", "properties": {"x": {"type": "string"}}},
        handler=lambda x="": {"ok": False, "error": "业务失败但没抛异常"},
        level="safe",
    )
    try:
        idx = [0]

        def llm(messages, tools):
            idx[0] += 1
            if idx[0] == 1:
                return {"tool_calls": [{"id": "1", "name": "_e3_softfail", "args": {"x": "y"}}]}
            return {"content": "SUCCESS：已完成。"}

        result = ask_agent("执行", llm_fn=llm)
        assert result["status"] == "tool_failed", result
        assert "_e3_softfail" in result["failed_tools"], result
        assert "_e3_softfail" not in result["executed_tools"], result
    finally:
        _tools.pop("_e3_softfail", None)


def test_route_and_goal_unified():
    """路由与目标识别统一：'更新一下画像'/'修改我的画像' 应路由到 agent（此前漏判为 tutor）。"""
    from agents.tool_agent import route_intent, _required_tool_groups
    assert route_intent("请更新一下画像") == "agent"
    assert route_intent("请修改我的画像") == "agent"
    # '设置目标为通过考试' 应识别出必要工具（此前进 agent 却无绑定）
    assert {"update_user_profile"} in _required_tool_groups("设置目标为通过考试")


def test_hypothetical_question_not_bound_as_action():
    """假设/怎么做类提问不应被误判为必须真实执行动作。"""
    from agents.tool_agent import _required_tool_groups
    assert _required_tool_groups("如果以后想更新画像，该怎么做？") == []
    assert _required_tool_groups("怎么才能修改我的学习目标？") == []

    # 端到端：这类问题即使模型直接作答，也不应被判为 tool_failed
    def llm(messages, tools):
        return {"content": "你可以在个人中心页面点击『编辑画像』来更新。"}
    result = ask_agent("如果以后想更新画像，该怎么做？", llm_fn=llm)
    assert result["status"] != "tool_failed", result
    assert result["unmet_required_tools"] == [], result


def test_e3_arg_retry_success_on_correction():
    """LLM 第一次给错误参数，第二次修正 → 工具成功调用，不被放弃。"""
    def _handler(query: str = ""):
        return {"result": f"got: {query}"}

    _tools["_e3_correct"] = Tool(
        name="_e3_correct", description="correct after retry",
        parameters={"type": "object", "properties": {"query": {"type": "string"}},
                    "required": ["query"]},
        handler=_handler, level="safe",
    )

    idx = [0]

    def fix_on_second_try(messages, tools):
        idx[0] += 1
        if idx[0] == 1:
            return {"tool_calls": [
                {"id": "bad1", "name": "_e3_correct", "args": {"query": 123}}  # 错误类型
            ]}
        if idx[0] == 2:
            return {"tool_calls": [
                {"id": "good1", "name": "_e3_correct", "args": {"query": "洁净区"}}  # 修正后
            ]}
        return {"content": "已用修正后参数完成查询。"}

    try:
        result = ask_agent("test correction", llm_fn=fix_on_second_try)
        tool_names = [t["name"] for t in result["tool_calls_log"]]
        # _e3_correct 应在 log 中出现两次（一次参数错误被拦，一次成功）
        assert tool_names.count("_e3_correct") >= 1
        assert result["answer"] != ""
    finally:
        _tools.pop("_e3_correct", None)
