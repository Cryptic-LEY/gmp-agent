"""
06 工具运行时：退避重试 + 可观测性。

run_with_retry : UpstreamError → 1s/2s/4s 退避最多 3 次；NotFound/Forbidden 不重试。
ContextObserver : 记录每步 token 增长斜率与工具重复计数；斜率异常产生告警。
"""
from __future__ import annotations

import time
from typing import Any, Callable

from tools.errors import (
    ForbiddenError, InvalidArgsError, NotFoundError, UpstreamError,
)

_NON_RETRYABLE = (NotFoundError, ForbiddenError, InvalidArgsError)
_BACKOFF_SEC = [1, 2, 4]          # F4：指数退避序列


def run_with_retry(
    fn: Callable,
    args: dict,
    max_retries: int | None = None,
    on_retry: Callable[[int, str], None] | None = None,
) -> Any:
    """
    执行 fn(**args)，对 UpstreamError 做指数退避重试。

    Args:
        fn          : 调用目标（通常是 tool handler 或 dispatch 包装）
        args        : kwargs 字典
        max_retries : 最大重试次数（默认取 config.TOOL_RETRY_MAX）
        on_retry    : (attempt: int, error_msg: str) → None，每次失败后回调
                      用于把错误反馈回模型（F4 "每次失败回灌模型"）
    """
    from config import TOOL_RETRY_MAX
    retries = max_retries if max_retries is not None else TOOL_RETRY_MAX

    last_err: Exception | None = None
    for attempt in range(retries + 1):
        try:
            return fn(**args)
        except _NON_RETRYABLE:
            raise                            # 不可重试类直接传播
        except UpstreamError as e:
            last_err = e
            if attempt < retries:
                # 只在会真正重试时才回调（on_retry 次数 = 重试次数）
                if on_retry:
                    on_retry(attempt, str(e))
                delay = _BACKOFF_SEC[min(attempt, len(_BACKOFF_SEC) - 1)]
                time.sleep(delay)

    raise last_err  # type: ignore[misc]


# ── 可观测性 ───────────────────────────────────────────────────────────────────

_ALERT_AVG_TOKEN_THRESHOLD = 400   # 平均每步 token 增量超此值 → 告警


class ContextObserver:
    """
    记录每步 token 增长斜率与工具重复计数。
    连续 ≥3 步平均斜率超阈值时写入 alerts（F5）。
    """

    def __init__(self):
        self._prev_tokens: int = 0
        self._slopes: list[int] = []
        self._repeat_counts: dict[str, int] = {}
        self.alerts: list[str] = []

    @property
    def slopes(self) -> list[int]:
        return self._slopes

    @property
    def repeat_counts(self) -> dict[str, int]:
        return dict(self._repeat_counts)

    def observe(self, messages: list[dict], step: int) -> dict:
        """记录一步的 token 增量，返回观测快照。"""
        tokens = sum(len(m.get("content") or "") for m in messages) // 4
        delta = tokens - self._prev_tokens
        self._slopes.append(delta)
        self._prev_tokens = tokens

        avg = sum(self._slopes) / len(self._slopes)
        obs: dict = {"step": step, "tokens": tokens, "delta": delta, "avg_slope": round(avg, 1)}

        if len(self._slopes) >= 3 and avg > _ALERT_AVG_TOKEN_THRESHOLD:
            msg = (
                f"[ContextAlert] step={step}：平均 token 增量 {avg:.0f} "
                f"> {_ALERT_AVG_TOKEN_THRESHOLD}，疑似死循环前兆"
            )
            self.alerts.append(msg)
            obs["alert"] = msg

        return obs

    def record_repeat(self, tool_name: str) -> int:
        """记录工具重复调用次数，返回当前累计次数。"""
        self._repeat_counts[tool_name] = self._repeat_counts.get(tool_name, 0) + 1
        return self._repeat_counts[tool_name]
