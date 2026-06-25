# -*- coding: utf-8 -*-
"""
Agent 推理步骤限制（02-context-perf）

防止 LangGraph Agent 因异常状态陷入无限 revise 循环。
"""
from config import MAX_REASONING_STEPS

_CONFIDENCE_THRESHOLD: float = 0.95


def early_stop(step: int, confidence: float = 0.0) -> bool:
    """
    判断是否提前结束推理。

    step         已执行的推理步骤数（从 0 开始计数）
    confidence   外部置信度信号（0~1）；1.0 = Critic 明确通过 / 无修改建议

    返回 True 的条件：
      - step >= MAX_REASONING_STEPS  →  超出硬上限，强制停止
      - confidence >= _CONFIDENCE_THRESHOLD  →  置信度已够高，无需继续
    """
    return step >= MAX_REASONING_STEPS or confidence >= _CONFIDENCE_THRESHOLD
