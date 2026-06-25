"""工具注册表：注册、查询 schema、分发执行。"""
from __future__ import annotations

from typing import Any

from tools.base import Tool
from tools.errors import ForbiddenError, InvalidArgsError, NotFoundError
from tools.validation import validate_args

_tools: dict[str, Tool] = {}


def register(tool: Tool) -> None:
    _tools[tool.name] = tool


def get_tool(name: str) -> Tool | None:
    return _tools.get(name)


def schemas() -> list[dict]:
    """返回所有已注册工具的 OpenAI function calling schema 列表。"""
    return [t.to_schema() for t in _tools.values()]


def dispatch(name: str, args: dict, authorized: bool = True) -> Any:
    """
    执行工具（单次尝试，不含重试）：
    1. 工具存在性检查（NotFoundError）
    2. Sensitive 鉴权检查（ForbiddenError）
    3. 参数 JSON Schema 校验（InvalidArgsError）
    4. 调用 handler（UpstreamError 由调用方用 run_with_retry 处理，见 tools/runtime.py）
    """
    if name not in _tools:
        raise NotFoundError(f"工具 {name!r} 未注册")

    t = _tools[name]

    if t.level == "sensitive" and not authorized:
        raise ForbiddenError(f"Sensitive 工具 {name!r} 需要授权（HITL 确认）")

    validate_args(t.parameters, args)
    return t.handler(**args)


# 加载内置工具（模块导入时自动注册）
from tools.builtin import _register_all  # noqa: E402
_register_all()
