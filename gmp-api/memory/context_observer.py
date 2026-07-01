"""上下文窗口用量观测器。

监控每次 generate 前注入的各段记忆 token 数，防止 prompt 悄悄膨胀导致：
  - 超出模型窗口被截断
  - 检索内容被挤掉影响召回质量
  - 延迟变高

token 粗估算法：len(text) / 1.5（汉字约 1.5 char/token）
精确计数需 tiktoken；此处用轻量近似，误差 < 20%，满足监控需求。
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# 注入记忆各段的 token 软预算（超出则 WARNING，不硬截）
_BUDGET: dict[str, int] = {
    "profile_hint":    200,
    "summary":         300,
    "current_state":   100,
    "negatives_hint":  300,
    "total_inject":    800,   # 以上四段之和的上限
}


def _estimate_tokens(text: str) -> int:
    """汉字为主文本的粗估 token 数：1 汉字 ≈ 1 token，英文 ≈ 0.75 token。"""
    if not text:
        return 0
    # 简单近似：总字符数 / 1.5
    return max(1, int(len(text) / 1.5))


class ContextObserver:
    """
    使用方式：
        obs = ContextObserver()
        obs.record("profile_hint", profile_hint)
        obs.record("summary", summary)
        obs.record("current_state", current_state_str)
        obs.record("negatives_hint", neg_hint)
        obs.check()          # 超出软预算时打 WARNING 日志
        report = obs.report() # 返回各段 token 数 dict
    """

    def __init__(self) -> None:
        self._counts: dict[str, int] = {}

    def record(self, name: str, text: str) -> int:
        """记录一段文本的 token 估算值并缓存，返回该段 token 数。"""
        n = _estimate_tokens(text)
        self._counts[name] = n
        return n

    def total_inject(self) -> int:
        """返回所有注入段的 token 总数（不含检索内容）。"""
        return sum(
            v for k, v in self._counts.items()
            if k in ("profile_hint", "summary", "current_state", "negatives_hint")
        )

    def check(self) -> None:
        """按预算检查各段及总量；超出时打 WARNING（不抛异常）。"""
        for name, budget in _BUDGET.items():
            if name == "total_inject":
                actual = self.total_inject()
            else:
                actual = self._counts.get(name, 0)
            if actual > budget:
                logger.warning(
                    "[ContextObserver] %s token=%d 超出预算 %d，"
                    "考虑截短或降级该注入段",
                    name, actual, budget,
                )

    def report(self) -> dict[str, int]:
        """返回各段 token 数 + total_inject 汇总。"""
        r = dict(self._counts)
        r["total_inject"] = self.total_inject()
        return r
