"""get_user_profile / update_user_profile：包装 03 档案卡（get=safe, update=sensitive）。"""
from __future__ import annotations

from tools.base import Tool


def _get_handler(user_id: str) -> dict:
    from memory.profile import get_profile, get_profile_hint
    profile = get_profile(user_id)
    return {"profile": profile, "hint": get_profile_hint(profile)}


def _update_handler(user_id: str, patch: dict) -> dict:
    from memory.profile import upsert_profile
    upsert_profile(user_id, patch)
    return {"status": "updated", "user_id": user_id}


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
            },
        },
        "required": ["user_id", "patch"],
    },
    handler=_update_handler,
    level="sensitive",
)
