"""search_regulation：包装 RAG 检索管线（safe）。"""
from __future__ import annotations

from tools.base import Tool


def _handler(query: str, edu_level: str | None = None) -> list[dict]:
    from rag.retriever import retrieve
    docs = retrieve(query, edu_level=edu_level)
    return [
        {"id": d.id, "doc_type": d.doc_type, "content": d.content[:500], "score": round(d.score, 4)}
        for d in docs[:8]
    ]


search_regulation = Tool(
    name="search_regulation",
    description=(
        "查询 GMP 法规条文和知识点。当用户提问法规内容、条款解释、具体规定时使用此工具。"
        "输入：查询文本（必填）、学历层次（可选：专科/本科）。"
        "输出：最相关的法规/知识点列表。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "查询内容"},
            "edu_level": {
                "type": "string",
                "enum": ["专科", "本科"],
                "description": "学历层次过滤（可选）",
            },
        },
        "required": ["query"],
    },
    handler=_handler,
    level="safe",
)
