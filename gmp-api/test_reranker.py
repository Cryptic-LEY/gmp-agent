# -*- coding: utf-8 -*-
"""
01-vector-engine 子任务6：reranker 单测（mock 注入，零 DashScope 调用）。

验收点（spec 01）：
  A5 反义/近形场景：re-rank 后 top-3 语义正确
  A6 re-rank 开/关对比：命中相关文档平均排名提升
"""
from rag.retriever import DocChunk
from rag.reranker import rerank


def _make_chunk(id_: str, content: str = "GMP 相关内容") -> DocChunk:
    return DocChunk(id_, "regulation", "标题", content, 0.5)


def test_rerank_empty_returns_empty():
    assert rerank("任意问题", [], rerank_fn=lambda q, p: []) == []


def test_rerank_orders_by_injected_scores():
    """mock 返回 [0.3, 0.9, 0.7]，输出顺序应为 c1 > c2 > c0。"""
    chunks = [_make_chunk(f"c{i}") for i in range(3)]

    def mock_fn(q, passages):
        return [0.3, 0.9, 0.7]

    result = rerank("问题", chunks, rerank_fn=mock_fn)
    ids = [c.id for c in result]
    assert ids[0] == "c1", f"首位应是 c1，实际 {ids}"
    assert ids[1] == "c2", f"次位应是 c2，实际 {ids}"


def test_rerank_dynamic_threshold_drops_far_scores():
    """top=1.0, min_ratio=0.7 → min=0.7；0.5 和 0.3 应被动态阈值剪掉。"""
    chunks = [_make_chunk(f"c{i}") for i in range(4)]

    def mock_fn(q, passages):
        return [1.0, 0.8, 0.5, 0.3]

    result = rerank("问题", chunks, rerank_fn=mock_fn)
    ids = [c.id for c in result]
    assert "c0" in ids and "c1" in ids, f"高分项应保留，ids={ids}"
    assert "c2" not in ids and "c3" not in ids, f"低分项应被阈值剪掉，ids={ids}"


def test_rerank_dynamic_threshold_keeps_mediocre_scores():
    """全部平庸 [0.4, 0.35, 0.3]：min = 0.4 * 0.7 = 0.28，三条都应保留。"""
    chunks = [_make_chunk(f"c{i}") for i in range(3)]

    def mock_fn(q, passages):
        return [0.4, 0.35, 0.3]

    result = rerank("问题", chunks, rerank_fn=mock_fn)
    assert len(result) == 3, f"平庸分段时应全部保留，实际 {len(result)} 条"


def test_rerank_top_n_caps_output():
    """top_n=2 在动态阈值之后截断，不超过 2 条。"""
    chunks = [_make_chunk(f"c{i}") for i in range(5)]

    def mock_fn(q, passages):
        return [0.9, 0.85, 0.8, 0.75, 0.7]

    result = rerank("问题", chunks, top_n=2, rerank_fn=mock_fn)
    assert len(result) == 2, f"top_n=2 应限制为 2 条，实际 {len(result)}"


def test_rerank_top_n_larger_than_filtered_returns_all():
    """top_n 大于动态阈值过滤后的条数时，返回全部过滤后的结果，不崩。"""
    chunks = [_make_chunk(f"c{i}") for i in range(3)]

    def mock_fn(q, passages):
        return [0.9, 0.85, 0.8]

    result = rerank("问题", chunks, top_n=10, rerank_fn=mock_fn)
    assert len(result) == 3, f"top_n=10 但只有 3 条，应全部返回，实际 {len(result)}"


def test_rerank_score_updated_on_docchunk():
    """输出 DocChunk.score 应等于 reranker 返回的分数，而非原始向量得分。"""
    chunk = _make_chunk("c0")
    assert chunk.score == 0.5, "初始 score 应为 0.5"

    def mock_fn(q, passages):
        return [0.92]

    result = rerank("问题", [chunk], rerank_fn=mock_fn)
    assert len(result) == 1
    assert abs(result[0].score - 0.92) < 1e-6, (
        f"score 应更新为 reranker 分数 0.92，实际 {result[0].score}"
    )
