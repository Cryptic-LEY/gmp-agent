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


def test_timeout_does_not_trigger_retry():
    """ToolTimeoutError 不触发重试逻辑（retry_count 保持 0）。"""
    retry_count = 0

    def counting_retry(attempt, msg):
        nonlocal retry_count
        retry_count += 1

    os.environ["TOOL_TIMEOUT_SEC"] = "1"
    import importlib, config as cfg
    importlib.reload(cfg)
    with pytest.raises(ToolTimeoutError):
        run_with_retry(_slow_handler, {}, max_retries=2, on_retry=counting_retry)
    assert retry_count == 0, f"ToolTimeoutError 不应触发重试，实际重试 {retry_count} 次"
    os.environ.pop("TOOL_TIMEOUT_SEC", None)


def test_tool_timeout_sec_configurable_via_env():
    """TOOL_TIMEOUT_SEC 可通过环境变量覆盖。"""
    import importlib, config as cfg
    os.environ["TOOL_TIMEOUT_SEC"] = "42"
    importlib.reload(cfg)
    assert cfg.TOOL_TIMEOUT_SEC == 42
    os.environ.pop("TOOL_TIMEOUT_SEC", None)
    importlib.reload(cfg)  # 恢复默认值
