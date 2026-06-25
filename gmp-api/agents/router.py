# -*- coding: utf-8 -*-
"""
模型路由（02-context-perf）

将 LangGraph 节点任务名映射到合适的模型：
  轻量任务（单跳查询/摘要）→ LLM_MODEL_SMALL
  重量任务（推理/批判/修订）→ LLM_MODEL_HEAVY
"""
from __future__ import annotations
from typing import Literal

from config import LLM_MODEL_SMALL, LLM_MODEL_HEAVY

TaskKind = Literal["light", "heavy"]

_LIGHT_TASKS: frozenset[str] = frozenset({
    "hyde",
    "summarize",
    "classify",
    "extract",
    "translate",
    "keyword",
})

_HEAVY_TASKS: frozenset[str] = frozenset({
    "generate",
    "critique",
    "revise",
    "reason",
    "plan",
    "reflect",
})


def route_model(task: str) -> str:
    """返回任务对应的模型 ID；未知任务默认使用重模型（保守策略）。"""
    if task in _LIGHT_TASKS:
        return LLM_MODEL_SMALL
    return LLM_MODEL_HEAVY
