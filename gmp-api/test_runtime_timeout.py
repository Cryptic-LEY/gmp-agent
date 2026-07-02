# -*- coding: utf-8 -*-
"""
P6 验收：工具调用超时控制（纯本地，无网络）。
"""
import os
import time
import pytest

from tools.errors import ToolTimeoutError
from tools.runtime import run_with_retry


def _fast_handler(**kwargs):
    """快速返回，用于正常路径测试。"""
    time.sleep(0.05)
    return "ok"


def _slow_handler(**kwargs):
    """慢速 handler，用于超时路径测试。"""
    time.sleep(3)
    return "never"


def test_fast_handler_returns_normally():
    """handler sleep(0.05s)，timeout=1s → 正常返回，无异常。"""
    result = run_with_retry(_fast_handler, {}, max_retries=0)
    assert result == "ok"


def test_slow_handler_raises_timeout_within_two_seconds():
    """handler sleep(3s)，timeout 由 TOOL_TIMEOUT_SEC 控制（设为 1s）→ ≤ 2s 内抛 ToolTimeoutError。"""
    os.environ["TOOL_TIMEOUT_SEC"] = "1"
    # 强制重新加载 config 中的 TOOL_TIMEOUT_SEC
    import importlib, config as cfg
    importlib.reload(cfg)
    # 也需要重新让 runtime 读到新值（run_with_retry 内部 from config import 每次重新求值）
    t0 = time.monotonic()
    with pytest.raises(ToolTimeoutError):
        run_with_retry(_slow_handler, {}, max_retries=0)
    elapsed = time.monotonic() - t0
    assert elapsed < 2.0, f"超时未在 2s 内触发，实际 {elapsed:.2f}s"
    os.environ.pop("TOOL_TIMEOUT_SEC", None)


def test_timeout_not_retried_for_non_idempotent(monkeypatch):
    """非幂等工具(retry_on_timeout=False)超时不重试。

    根因：_call_with_timeout 超时后旧线程仍在后台跑 handler；若再重试，
    写操作会被执行多次(重复副作用)。故非幂等工具超时应只执行一次即失败。
    """
    import tools.runtime as rt
    sleep_log = []
    monkeypatch.setattr(rt.time, "sleep", lambda s: sleep_log.append(s))

    def _always_timeout(fn, args, timeout_sec):
        raise ToolTimeoutError("模拟工具超时")
    monkeypatch.setattr(rt, "_call_with_timeout", _always_timeout)

    retry_msgs = []
    with pytest.raises(ToolTimeoutError):
        run_with_retry(_slow_handler, {}, max_retries=3, retry_on_timeout=False,
                       on_retry=lambda a, m: retry_msgs.append(m))
    assert retry_msgs == [], f"非幂等超时不应重试，实际重试 {len(retry_msgs)} 次"
    assert sleep_log == [], f"非幂等超时不应退避，实际 {sleep_log}"


def test_upstream_still_retried_when_timeout_disabled(monkeypatch):
    """retry_on_timeout=False 只关超时重试，UpstreamError 仍照常退避重试。"""
    import tools.runtime as rt
    monkeypatch.setattr(rt.time, "sleep", lambda s: None)
    from tools.errors import UpstreamError

    calls = [0]
    def _always_upstream(fn, args, timeout_sec):
        calls[0] += 1
        raise UpstreamError("上游5xx")
    monkeypatch.setattr(rt, "_call_with_timeout", _always_upstream)

    with pytest.raises(UpstreamError):
        run_with_retry(_slow_handler, {}, max_retries=2, retry_on_timeout=False)
    assert calls[0] == 3, f"UpstreamError 应重试(1+2=3次)，实际 {calls[0]}"


def test_timeout_triggers_backoff_retry(monkeypatch):
    """F4（spec §4.1 / F4 表）：ToolTimeoutError 触发 1s/2s/4s 退避重试。

    以前的实现把 Timeout 列为不可重试（测试通过但违反规格）。
    这里用 stub 让 _call_with_timeout 直接抛 ToolTimeoutError，
    并 monkeypatch sleep，避免真实等待，专测重试时序。
    """
    import tools.runtime as rt

    sleep_log: list[int] = []
    monkeypatch.setattr(rt.time, "sleep", lambda s: sleep_log.append(s))

    def _always_timeout(fn, args, timeout_sec):
        raise ToolTimeoutError("模拟工具超时")

    monkeypatch.setattr(rt, "_call_with_timeout", _always_timeout)

    retry_msgs: list[str] = []
    with pytest.raises(ToolTimeoutError):
        run_with_retry(
            _slow_handler, {}, max_retries=3,
            on_retry=lambda attempt, msg: retry_msgs.append(msg),
        )

    assert len(retry_msgs) == 3, f"Timeout 应触发 3 次重试，实际 {len(retry_msgs)}"
    assert sleep_log == [1, 2, 4], f"退避序列应为 [1,2,4]，实为 {sleep_log}"
    assert all("超时" in m for m in retry_msgs)


def test_tool_timeout_sec_configurable_via_env():
    """TOOL_TIMEOUT_SEC 可通过环境变量覆盖。"""
    import importlib, config as cfg
    os.environ["TOOL_TIMEOUT_SEC"] = "42"
    importlib.reload(cfg)
    assert cfg.TOOL_TIMEOUT_SEC == 42
    os.environ.pop("TOOL_TIMEOUT_SEC", None)
    importlib.reload(cfg)  # 恢复默认值
