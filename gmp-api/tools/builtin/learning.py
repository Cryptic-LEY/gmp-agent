"""plan_learning_path：基于用户画像 + MAJOR_DOSAGE_FORM_MAP 出个性化学习路径（safe）。"""
from __future__ import annotations

from tools.base import Tool


def _handler(user_id: str, goal: str) -> dict:
    from memory.profile import get_profile, get_profile_hint
    from config import MAJOR_DOSAGE_FORM_MAP

    profile = get_profile(user_id)
    major = profile.get("major", "")
    edu_level = profile.get("edu_level", "")
    weak_kp: list = profile.get("weak_kp", [])
    goals: list = profile.get("goals", [])
    dosage = MAJOR_DOSAGE_FORM_MAP.get(major, {})

    steps = []
    if weak_kp:
        steps.append(f"① 优先突破薄弱知识点：{', '.join(str(k) for k in weak_kp[:3])}")
    else:
        steps.append("① 建立 GMP 基础认知体系（质量管理/人员/厂房设施）")

    primary_forms = dosage.get("primary_forms", ["通用剂型"])
    steps.append(f"② 聚焦主剂型：{', '.join(primary_forms)}（结合专业 {major or '通用'} 背景）")

    steps.append(f"③ 实践目标：{goal}")

    if goals:
        steps.append(f"④ 长期目标：{goals[0]}")

    return {
        "user_id": user_id,
        "edu_level": edu_level,
        "major": major,
        "goal": goal,
        "plan": steps,
        "primary_forms": primary_forms,
    }


plan_learning_path = Tool(
    name="plan_learning_path",
    description=(
        "为用户规划个性化 GMP 学习路径。"
        "当用户要求「帮我规划」「出学习计划」「怎么备考」等时调用。"
        "基于用户画像（薄弱点/专业/剂型方向）生成有序学习步骤。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "user_id": {"type": "string", "description": "用户 ID"},
            "goal": {"type": "string", "description": "本次学习目标或薄弱方向"},
        },
        "required": ["user_id", "goal"],
    },
    handler=_handler,
    level="safe",
)
