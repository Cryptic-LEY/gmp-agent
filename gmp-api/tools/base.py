"""工具基础类型定义。"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Literal, Any


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict          # JSON Schema（OpenAI function calling 格式）
    handler: Callable         # (**args) -> Any
    level: Literal["safe", "sensitive"] = "safe"

    def to_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }
