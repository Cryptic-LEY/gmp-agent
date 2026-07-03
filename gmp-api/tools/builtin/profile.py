"""get_user_profile / update_user_profile：包装 03 档案卡（get=safe, update=sensitive）。"""
from __future__ import annotations

from tools.base import Tool


def _get_handler(user_id: str) -> dict:
    from memory.profile import get_profile, get_profile_hint
    profile = get_profile(user_id)
    return {"profile": profile, "hint": get_profile_hint(profile)}


def _update_handler(user_id: str, patch: dict) -> dict:
    from memory.profile import upsert_profile
    from tools.errors import InvalidArgsError
    if not isinstance(patch, dict) or not patch:
        raise InvalidArgsError("patch 为空，没有任何字段可更新")
    updated = upsert_profile(user_id, patch)
    if not updated:
        # 只含无效字段：无列被写入，不能谎报 updated（证明业务效果真实发生）
        raise InvalidArgsError(
            "patch 未包含任何可更新字段（有效字段：edu_level/major/weak_kp/goals/prefs）"
        )
    return {"status": "updated", "user_id": user_id, "updated_fields": updated}


get_user_profile = Tool(
    name="get_user_profile",
    description=(
        "查询用户学习画像（学历、专业、薄弱知识点、学习目标）。"
        "当需要了解用户背景以个性化回答、规划学习路径时调用。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "user_id": {"type": "string", "description": "用户 ID"},
        },
        "required": ["user_id"],
    },
    handler=_get_handler,
    level="safe",
)

update_user_profile = Tool(
    name="update_user_profile",
    description=(
        "更新用户学习画像（薄弱知识点、学习目标、偏好等）。"
        "sensitive 操作，需要用户授权。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "user_id": {"type": "string", "description": "用户 ID"},
            "patch": {
                "type": "object",
                "description": "要更新的字段，如 {weak_kp: [...], goals: [...]}",
                # 在 dispatch 前的参数校验就拦截「空 patch / 未知字段」，
                # 走 InvalidArgs 自修正路径（回灌+次数限制），而非 handler 内的通用 Error。
                "minProperties": 1,
                "additionalProperties": False,
                "properties": {
                    "edu_level": {"type": "string"},
                    "major":     {"type": "string"},
                    "weak_kp":   {"type": "array"},
                    "goals":     {"type": "array"},
                    "prefs":     {"type": "object"},
                },
            },
        },
        "required": ["user_id", "patch"],
    },
    handler=_update_handler,
    level="sensitive",
)
