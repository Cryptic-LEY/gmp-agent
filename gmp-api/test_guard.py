# -*- coding: utf-8 -*-
"""
F1/F2/F3/F5 防死循环护栏测试（不调 DashScope/DB）。
"""
import pytest
from agents.guard import GuardRail, BudgetExceeded, LoopDetected
from config import GUARD_MAX_STEPS, GUARD_REPEAT_LIMIT


# ── F1：物理红线——步数超限抛 BudgetExceeded ──────────────────────────────────

def test_f1_guardtail_raises_at_max_steps():
    guard = GuardRail()
    for _ in range(GUARD_MAX_STEPS):
        guard.tick([])
    with pytest.raises(BudgetExceeded):
        guard.tick([])


def test_f1_tick_within_limit_ok():
    guard = GuardRail(max_steps=3)
    guard.tick([])
    guard.tick([])
    guard.tick([])  # 第 3 步仍 ok


def test_f1_token_budget_raises():
    """token 预算超限也应抛 BudgetExceeded。"""
    guard = GuardRail(max_tokens=10)   # 设极低预算
    # 消息内容 80 字符 / 4 ≈ 20 token，超过 max_tokens=10
    big_msg = [{"role": "user", "content": "x" * 80}]
    with pytest.raises(BudgetExceeded, match="token"):
        guard.tick(big_msg)


def test_f1_token_budget_ok_within_limit():
    guard = GuardRail(max_tokens=1000)
    small_msg = [{"role": "user", "content": "短消息"}]
    guard.tick(small_msg)  # 不应抛异常


def test_f1_ask_agent_graceful_on_budget_exceeded():
    """ask_agent 捕获 BudgetExceeded，优雅返回，不抛未处理异常。"""
    from agents.tool_agent import ask_agent
    from tools.registry import _tools
    from tools.base import Tool

    def _handler(q: str = ""):
        return {}

    _tools["_f1_mock"] = Tool(
        name="_f1_mock", description="f1 mock",
        parameters={"type": "object", "properties": {"q": {"type": "string"}}},
        handler=_handler, level="safe",
    )

    counter = [0]

    def always_tool(msgs, tools):
        counter[0] += 1
        return {"tool_calls": [{"id": str(counter[0]), "name": "_f1_mock", "args": {"q": "x"}}]}

    try:
        result = ask_agent("test", llm_fn=always_tool)
        # 不应抛异常；步数 ≤ GUARD_MAX_STEPS
        assert result["steps"] <= GUARD_MAX_STEPS
    finally:
        _tools.pop("_f1_mock", None)


# ── F2：动作哈希重复检测——连续 N 次相同 → 返回"切换思路"警告 ─────────────────

def test_f2_no_warning_before_limit():
    guard = GuardRail()
    for _ in range(GUARD_REPEAT_LIMIT - 1):
        msg = guard.check_action("search_regulation", {"query": "洁净区"})
        assert msg is None, "未达 GUARD_REPEAT_LIMIT 前不应有警告"


def test_f2_warning_at_limit():
    guard = GuardRail()
    for _ in range(GUARD_REPEAT_LIMIT - 1):
        guard.check_action("search_regulation", {"query": "洁净区"})
    warning = guard.check_action("search_regulation", {"query": "洁净区"})
    assert warning is not None
    assert "切换" in warning or "重复" in warning


def test_f2_different_args_not_counted():
    """不同 args 不算重复。"""
    guard = GuardRail()
    for i in range(GUARD_REPEAT_LIMIT + 5):
        result = guard.check_action("search_regulation", {"query": f"不同查询{i}"})
        assert result is None


def test_f2_ask_agent_injects_loop_warning():
    """ask_agent 检测到重复后，messages 中应出现包含"切换"的警告。"""
    from agents.tool_agent import ask_agent
    from tools.registry import _tools
    from tools.base import Tool

    def _handler(q: str = ""):
        return {"result": "mock"}

    _tools["_f2_mock"] = Tool(
        name="_f2_mock", description="f2 mock",
        parameters={"type": "object", "properties": {"q": {"type": "string"}}},
        handler=_handler, level="safe",
    )

    warning_seen = [False]
    counter = [0]

    def check_llm(msgs, tools):
        counter[0] += 1
        for m in msgs:
            if "切换" in (m.get("content") or ""):
                warning_seen[0] = True
        # 在达到警告阈值前继续重复；之后给出终答
        if counter[0] > GUARD_REPEAT_LIMIT + 1:
            return {"content": "已切换思路，终答。"}
        return {"tool_calls": [{"id": str(counter[0]), "name": "_f2_mock", "args": {"q": "same"}}]}

    try:
        ask_agent("test", llm_fn=check_llm)
        assert warning_seen[0], "messages 中应注入循环警告"
    finally:
        _tools.pop("_f2_mock", None)


# ── F3：状态快照与回退——回退到上一个正常决策点 ───────────────────────────────

def test_f3_snapshot_saved_on_tick():
    guard = GuardRail()
    msgs1 = [{"role": "user", "content": "q"}]
    msgs2 = [{"role": "user", "content": "q"}, {"role": "assistant", "content": "a"}]
    guard.tick(msgs1)
    guard.tick(msgs2)
    assert len(guard.snapshots) == 2


def test_f3_rollback_returns_previous():
    guard = GuardRail()
    msgs1 = [{"role": "user", "content": "q"}]
    msgs2 = [{"role": "user", "content": "q"}, {"role": "assistant", "content": "a"}]
    guard.tick(msgs1)
    guard.tick(msgs2)
    rolled = guard.rollback()
    assert rolled == msgs1


def test_f3_rollback_single_snapshot():
    guard = GuardRail()
    msgs1 = [{"role": "user", "content": "q"}]
    guard.tick(msgs1)
    rolled = guard.rollback()
    assert rolled == msgs1  # 仅一个快照时回退到自身


def test_f3_rollback_none_on_empty():
    guard = GuardRail()
    assert guard.rollback() is None


# ── F5：可观测性——token 斜率与重复计数被记录，异常时产生告警 ─────────────────

def test_f5_context_slope_recorded():
    from tools.runtime import ContextObserver
    obs = ContextObserver()
    obs.observe([{"role": "user", "content": "x" * 100}], step=1)
    obs.observe([{"role": "user", "content": "x" * 200}], step=2)
    assert len(obs.slopes) == 2


def test_f5_repeat_count_tracked():
    from tools.runtime import ContextObserver
    obs = ContextObserver()
    obs.record_repeat("search_regulation")
    obs.record_repeat("search_regulation")
    assert obs.repeat_counts["search_regulation"] == 2


def test_f5_repeat_count_is_consecutive_not_cumulative():
    """连续重复语义：插入不同工具后，原工具的连续计数清零。"""
    from tools.runtime import ContextObserver
    obs = ContextObserver()
    obs.record_repeat("A")
    obs.record_repeat("A")            # A 连续 2
    assert obs.repeat_counts["A"] == 2
    obs.record_repeat("B")            # 切到 B，A 连续清零
    assert obs.repeat_counts["A"] == 0
    assert obs.repeat_counts["B"] == 1
    assert obs.record_repeat("A") == 1  # A 重新从 1 起（非累计到 3）


def test_f5_anomaly_alert_generated():
    """持续大幅增长时应产生告警条目。"""
    from tools.runtime import ContextObserver
    obs = ContextObserver()
    base = "x" * 2000
    for i in range(4):
        msgs = [{"role": "user", "content": base * (i + 1)}]
        obs.observe(msgs, step=i + 1)
    assert len(obs.alerts) > 0, "持续大增长应触发告警"


def test_f5_normal_growth_no_alert():
    """正常增长不触发告警。"""
    from tools.runtime import ContextObserver
    obs = ContextObserver()
    for i in range(3):
        msgs = [{"role": "user", "content": "短消息"}]
        obs.observe(msgs, step=i + 1)
    assert len(obs.alerts) == 0
