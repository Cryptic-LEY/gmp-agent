# -*- coding: utf-8 -*-
"""
F4 超时/退避重试/分类测试（不调 DashScope/DB）。
"""
import pytest
from tools.runtime import run_with_retry
from tools.errors import UpstreamError, NotFoundError, ForbiddenError


# ── F4：退避重试时序 ─────────────────────────────────────────────────────────

def test_f4_upstream_retries_3_times_with_backoff(monkeypatch):
    """UpstreamError 触发 1s/2s/4s 退避、共调用 1+3=4 次。"""
    import tools.runtime as rt
    sleep_log = []
    monkeypatch.setattr(rt.time, "sleep", lambda s: sleep_log.append(s))

    call_count = [0]
    retry_log = []

    def always_upstream(**kwargs):
        call_count[0] += 1
        raise UpstreamError("模拟上游超时")

    with pytest.raises(UpstreamError):
        run_with_retry(
            always_upstream, {},
            max_retries=3,
            on_retry=lambda attempt, msg: retry_log.append((attempt, msg)),
        )

    assert call_count[0] == 4, "原始调用 1 次 + 重试 3 次 = 4 次"
    assert sleep_log == [1, 2, 4], f"退避序列应为 [1,2,4]，实为 {sleep_log}"
    assert len(retry_log) == 3, "on_retry 应被回调 3 次"


def test_f4_on_retry_called_with_error_message(monkeypatch):
    """每次失败 on_retry 获得具体错误信息，供回灌模型。"""
    import tools.runtime as rt
    monkeypatch.setattr(rt.time, "sleep", lambda _: None)

    messages = []

    def always_upstream(**kwargs):
        raise UpstreamError("数据库连接超时")

    with pytest.raises(UpstreamError):
        run_with_retry(
            always_upstream, {},
            max_retries=2,
            on_retry=lambda attempt, msg: messages.append(msg),
        )

    assert len(messages) == 2
    assert all("超时" in m for m in messages)


def test_f4_not_found_no_retry():
    """NotFoundError 不触发重试（call_count = 1）。"""
    call_count = [0]

    def always_not_found(**kwargs):
        call_count[0] += 1
        raise NotFoundError("资源不存在")

    with pytest.raises(NotFoundError):
        run_with_retry(always_not_found, {})

    assert call_count[0] == 1


def test_f4_forbidden_no_retry():
    """ForbiddenError 不触发重试。"""
    call_count = [0]

    def always_forbidden(**kwargs):
        call_count[0] += 1
        raise ForbiddenError("未授权")

    with pytest.raises(ForbiddenError):
        run_with_retry(always_forbidden, {})

    assert call_count[0] == 1


def test_f4_success_on_second_attempt(monkeypatch):
    """第 1 次失败，第 2 次成功 → 返回结果，sleep 调用 1 次。"""
    import tools.runtime as rt
    sleep_log = []
    monkeypatch.setattr(rt.time, "sleep", lambda s: sleep_log.append(s))

    attempt = [0]

    def fails_once(**kwargs):
        attempt[0] += 1
        if attempt[0] == 1:
            raise UpstreamError("临时故障")
        return {"result": "ok"}

    result = run_with_retry(fails_once, {})
    assert result == {"result": "ok"}
    assert sleep_log == [1]  # 只退避了一次


def test_f4_no_retry_on_success():
    """首次成功时 on_retry 不被调用。"""
    called = [0]

    def always_ok(**kwargs):
        return "ok"

    result = run_with_retry(always_ok, {}, on_retry=lambda *_: called.__setitem__(0, called[0]+1))
    assert result == "ok"
    assert called[0] == 0
