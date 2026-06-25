"""
06 防死循环护栏：物理红线 + 动作哈希重复检测 + 状态快照回退。

GuardRail 是 per-invocation 对象，由 ask_agent 每次调用时创建。
"""
from __future__ import annotations

import hashlib
import json

from config import GUARD_MAX_STEPS, GUARD_MAX_TOKENS, GUARD_REPEAT_LIMIT


class BudgetExceeded(Exception):
    """步数或 token 预算耗尽→强制终止。"""


class LoopDetected(Exception):
    """相同动作连续达到阈值→（保留供未来升级为异常路径使用）。"""


class GuardRail:
    """
    三层防死循环护栏的有状态对象。

    F1：tick(messages) 在每步开始时检查步数 + token 预算，超限抛 BudgetExceeded。
    F2：check_action(tool_name, args) 检测重复动作，达阈值返回警告字符串。
    F3：rollback() 回退到上一个正常决策点（second-to-last snapshot）。
    """

    def __init__(
        self,
        max_steps: int | None = None,
        max_tokens: int | None = None,
        repeat_limit: int | None = None,
    ):
        self.max_steps = max_steps if max_steps is not None else GUARD_MAX_STEPS
        self.max_tokens = max_tokens if max_tokens is not None else GUARD_MAX_TOKENS
        self.repeat_limit = repeat_limit if repeat_limit is not None else GUARD_REPEAT_LIMIT
        self._step = 0
        self._action_counts: dict[str, int] = {}
        self._snapshots: list[list[dict]] = []

    # ── F1：物理红线（步数 + token 预算） ─────────────────────────────────────

    def tick(self, messages: list[dict]) -> None:
        """
        每步开始时调用：
        - 步数超过 max_steps → BudgetExceeded
        - 消息累计 token 估算超过 max_tokens → BudgetExceeded
        同时保存本步状态快照（F3 回退用）。
        """
        self._step += 1
        if self._step > self.max_steps:
            raise BudgetExceeded(
                f"已达到最大步数上限 {self.max_steps}，强制终止任务。"
            )

        token_estimate = self._estimate_tokens(messages)
        if token_estimate > self.max_tokens:
            raise BudgetExceeded(
                f"上下文 token 估算值 {token_estimate} "
                f"超过预算 {self.max_tokens}，强制终止任务。"
            )

        self._snapshots.append(list(messages))

    @staticmethod
    def _estimate_tokens(messages: list[dict]) -> int:
        """粗估 token 数：总字符数 / 4（中英文混合场景近似值）。"""
        return sum(len(m.get("content") or "") for m in messages) // 4

    # ── F2：动作哈希重复检测 ──────────────────────────────────────────────────

    def check_action(self, tool_name: str, args: dict) -> str | None:
        """
        检测 (tool_name + normalized_args) 是否已重复达到阈值。
        未达阈值返回 None；达到或超过阈值返回警告字符串（注入给模型）。
        """
        key = f"{tool_name}:{json.dumps(args, sort_keys=True, ensure_ascii=False)}"
        h = hashlib.md5(key.encode()).hexdigest()
        self._action_counts[h] = self._action_counts.get(h, 0) + 1
        count = self._action_counts[h]
        if count >= self.repeat_limit:
            return (
                f"[循环警告] 你已连续 {count} 次以相同参数调用工具 {tool_name!r}，"
                f"请立刻切换思路或终止，不要再重复相同调用。"
            )
        return None

    # ── F3：状态快照与回退 ────────────────────────────────────────────────────

    @property
    def snapshots(self) -> list[list[dict]]:
        return self._snapshots

    def rollback(self) -> list[dict] | None:
        """
        回退到上一个正常决策点（second-to-last snapshot）。
        快照不足 2 个时返回最早的；无快照返回 None。
        """
        if len(self._snapshots) >= 2:
            return list(self._snapshots[-2])
        if self._snapshots:
            return list(self._snapshots[-1])
        return None
