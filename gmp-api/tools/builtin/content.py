"""
review_assignment / generate_courseware：内容生成类工具（sensitive）。
两者均调 DashScope（轻量模型）；测试时注入 mock handler。
"""
from __future__ import annotations

from tools.base import Tool


def _review_handler(submission: str, question: str | None = None) -> dict:
    from agents.tutor import _llm_chat
    from agents.router import route_model

    ctx = f"题目：{question}\n\n" if question else ""
    prompt = (
        f"{ctx}学生作答：\n{submission}\n\n"
        "你是GMP法规考官，请对学生作答做简短评分（0-100分）和批改意见（2-3句）。\n"
        "返回格式：\n分数：XX\n评语：..."
    )
    result = _llm_chat([{"role": "user", "content": prompt}],
                       temperature=0.3, model=route_model("generate"))
    lines = result.strip().splitlines()
    score = 0
    feedback = result
    for ln in lines:
        if ln.startswith("分数："):
            try:
                score = int(ln.replace("分数：", "").strip())
            except ValueError:
                pass
        elif ln.startswith("评语："):
            feedback = ln.replace("评语：", "").strip()
    return {"score": score, "feedback": feedback}


def _courseware_handler(topic: str, edu_level: str | None = None) -> dict:
    from agents.tutor import _llm_chat
    from agents.router import route_model

    level_note = f"（{edu_level}层次）" if edu_level else ""
    prompt = (
        f"请为GMP课程生成「{topic}」{level_note}的简短教学课件提纲（3-5个知识点，每点一句）。"
    )
    content = _llm_chat([{"role": "user", "content": prompt}],
                        temperature=0.5, model=route_model("generate"))
    return {"title": topic, "edu_level": edu_level, "content": content}


review_assignment = Tool(
    name="review_assignment",
    description=(
        "批改学生的 GMP 作业/问答。"
        "sensitive 操作，需要授权。"
        "输入：学生提交内容（必填）、原题（可选）。输出：分数和批改意见。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "submission": {"type": "string", "description": "学生作答内容"},
            "question": {"type": "string", "description": "原题（可选）"},
        },
        "required": ["submission"],
    },
    handler=_review_handler,
    level="sensitive",
)

generate_courseware = Tool(
    name="generate_courseware",
    description=(
        "生成 GMP 教学课件/提纲。"
        "sensitive 操作，需要授权。"
        "输入：主题（必填）、学历层次（可选）。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "topic": {"type": "string", "description": "课件主题"},
            "edu_level": {
                "type": "string",
                "enum": ["专科", "本科"],
                "description": "学历层次（可选）",
            },
        },
        "required": ["topic"],
    },
    handler=_courseware_handler,
    level="sensitive",
)
