"""历史经验回流（层④）：好 case embed 进 01 的向量索引（doc_type='experience'）。"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_EXP_PREFIX = "EXP-"


def add_experience(
    exp_id: str,
    question: str,
    answer: str,
    sources: list[str],
    embed_fn=None,
) -> bool:
    """
    把好 case 加入进程内向量索引。

    Args:
        exp_id:    经验条目唯一 ID（如 "exp001"），会加 EXP- 前缀
        question:  历史问题
        answer:    历史好答案（与 question 一起嵌入）
        sources:   原始来源 reg_id 列表（仅作元数据存储）
        embed_fn:  embedding 函数 (text: str) -> list[float]
                   默认 rag.retriever.embed_query；可注入 mock 绕开 DashScope

    Returns:
        True 表示成功加入索引；False 表示降级（索引不可用或嵌入失败）。
    """
    from rag.vector_index import get_index

    idx = get_index()
    if idx is None:
        return False

    if embed_fn is None:
        from rag.retriever import embed_query
        embed_fn = embed_query

    try:
        vec = embed_fn(f"{question} {answer[:500]}")
    except Exception as exc:
        logger.warning("experience embed failed for %s: %s", exp_id, exc)
        return False

    chunk_id = f"{_EXP_PREFIX}{exp_id}"
    idx.add_items([{
        "id":        chunk_id,
        "reg_id":    chunk_id,
        "doc_type":  "experience",
        "title":     question[:100],
        "content":   answer,
        "edu_level": None,
        "vec":       vec,
    }])
    return True
