"""
re-rank 模块：DashScope gte-rerank-v2（主）+ 动态阈值 + small→big 收尾。

rerank_fn 可注入用于单测（零 API 成本）：
    rerank_fn(question: str, passages: list[str]) -> list[float]
"""
from typing import Callable

import dashscope

from config import DASHSCOPE_API_KEY, RAG_RERANK_MODEL
from rag.retriever import DocChunk

# 动态阈值：若得分 < top * _MIN_RATIO，则剪掉长尾（保留高相关；全平庸时 min 低，自动放宽）。
# 0.70 过激：多面向问题里次相关 chunk 常低于最佳 70% 被误杀，曾把 15 条砍成 1 条 → CP/召回崩。
_MIN_RATIO = 0.40
# 保底：动态阈值后至少保留这么多条（与 top_n/候选数取小），防止砍到饥饿。
_MIN_KEEP = 6

RerankerFn = Callable[[str, list[str]], list[float]]


def _dashscope_rerank(question: str, passages: list[str]) -> list[float]:
    """调用 DashScope gte-rerank-v2 SDK，返回与 passages 同序的分数列表。"""
    try:
        dashscope.api_key = DASHSCOPE_API_KEY
        resp = dashscope.TextReRank.call(
            model=RAG_RERANK_MODEL,
            query=question,
            documents=passages,
            return_documents=False,
            top_n=len(passages),
        )
        if resp.status_code != 200:
            raise RuntimeError(f"rerank status {resp.status_code}: {resp.message}")
        scores = [0.0] * len(passages)
        for item in resp.output.results:
            scores[item.index] = float(item.relevance_score)
        return scores
    except Exception:
        # fallback：保持原顺序，微小步长确保全部通过动态阈值（0.001*N < 0.3 for N≤300）
        return [1.0 - i * 0.001 for i in range(len(passages))]


def rerank(
    question: str,
    chunks: list[DocChunk],
    *,
    top_n: int | None = None,
    rerank_fn: RerankerFn | None = None,
) -> list[DocChunk]:
    """
    对候选 DocChunk 列表重排。rerank_fn 可注入用于测试，None 时调用 DashScope。

    动态阈值：score < top_score * _MIN_RATIO 的条目被剪掉；全部平庸时 min 低，全部保留。
    top_n：动态阈值后再做硬截断。
    """
    if not chunks:
        return []

    fn = rerank_fn or _dashscope_rerank
    scores = fn(question, [c.content for c in chunks])

    ranked = sorted(zip(scores, chunks), key=lambda x: x[0], reverse=True)

    # 动态阈值剪长尾
    top_score = ranked[0][0]
    min_score = top_score * _MIN_RATIO
    kept = [(s, c) for s, c in ranked if s >= min_score]

    # 保底：阈值不得把结果砍到少于 floor 条（floor = min(候选数, top_n, _MIN_KEEP)）
    cap = top_n if top_n is not None else len(ranked)
    floor = min(len(ranked), cap, _MIN_KEEP)
    if len(kept) < floor:
        kept = ranked[:floor]

    if top_n is not None:
        kept = kept[:top_n]

    return [
        DocChunk(c.id, c.doc_type, c.title, c.content, float(s))
        for s, c in kept
    ]
