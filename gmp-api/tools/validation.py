"""参数 JSON Schema 校验。"""
from __future__ import annotations

import jsonschema as _js

from tools.errors import InvalidArgsError


def validate_args(schema: dict, args: dict) -> None:
    """
    用 jsonschema 校验 args 是否符合 schema。
    不合法时抛 InvalidArgsError（含具体错误信息），供 FC 循环回灌 LLM 自修正。
    """
    try:
        _js.validate(instance=args, schema=schema)
    except _js.ValidationError as e:
        raise InvalidArgsError(e.message) from e
    except _js.SchemaError as e:
        raise InvalidArgsError(f"Schema 定义有误: {e.message}") from e
