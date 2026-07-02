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
    """top=1.0, min_ratio=0.40 → min=0.40；候选足够多时，<0.40 的长尾被剪掉。

    用 10 条(超过 _MIN_KEEP=6)确保阈值真的生效、不被保底掩盖。
    """
    chunks = [_make_chunk(f"c{i}") for i in range(10)]

    def mock_fn(q, passages):
        return [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.3, 0.2, 0.1]

    result = rerank("问题", chunks, rerank_fn=mock_fn)
    ids = [c.id for c in result]
    assert "c0" in ids and "c6" in ids, f"≥0.40 的应保留，ids={ids}"
    assert "c7" not in ids and "c8" not in ids and "c9" not in ids, \
        f"<0.40 的长尾应被剪掉，ids={ids}"


def test_rerank_floor_prevents_starvation():
    """回归：1 条高分 + 一堆低分时，动态阈值本会砍到 1 条；保底须保留 ≥ _MIN_KEEP 条。

    复现真实 bug：多面向问题里次相关 chunk 分数远低于最佳，旧 0.70 阈值把 15 条砍成 1 条。
    """
    from rag.reranker import _MIN_KEEP
    chunks = [_make_chunk(f"c{i}") for i in range(12)]

    def mock_fn(q, passages):
        return [1.0] + [0.2] * 11  # 仅 1 条高分，其余远低于 0.40*top

    result = rerank("问题", chunks, rerank_fn=mock_fn)
    assert len(result) >= _MIN_KEEP, \
        f"保底应保留 ≥ {_MIN_KEEP} 条，避免砍到饥饿，实际 {len(result)}"
    assert result[0].id == "c0", "最高分仍应排首位"


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
