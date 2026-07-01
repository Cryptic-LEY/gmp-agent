# -*- coding: utf-8 -*-
"""
02-context-perf 子任务3：cache/semantic_cache.py 单测

B5  命中 TTFT < 100ms；高频集 hit rate > 30%
B6  invalidate() 或 rebuild() 后缓存失效
"""
import time
import pytest
import numpy as np

from cache.semantic_cache import SemanticCache, get_cache


# ─── 辅助 ─────────────────────────────────────────────────────────────────────

def _unit_vec(dim: int = 1024, seed: int = 0) -> list[float]:
    rng = np.random.RandomState(seed)
    v = rng.randn(dim).astype(np.float32)
    return (v / np.linalg.norm(v)).tolist()


# ─── 基础命中/未命中 ──────────────────────────────────────────────────────────

def test_hit_same_vector():
    cache = SemanticCache(max_size=100, threshold=0.9)
    vec = _unit_vec(seed=1)
    cache.put(vec, None, {"answer": "hello", "sources": []})
    hit = cache.get(vec, None)
    assert hit is not None
    assert hit["answer"] == "hello"


def test_miss_orthogonal_vector():
    cache = SemanticCache(max_size=100, threshold=0.9)
    # 两个近似正交向量（cosine ≈ 0）
    v1 = [1.0] + [0.0] * 1023
    v2 = [0.0, 1.0] + [0.0] * 1022
    cache.put(v1, None, {"answer": "v1"})
    assert cache.get(v2, None) is None


def test_miss_when_empty():
    cache = SemanticCache(max_size=100, threshold=0.9)
    assert cache.get(_unit_vec(), None) is None


def test_respects_edu_level_isolation():
    """同一向量、不同 edu_level 分别存取，互不干扰。"""
    cache = SemanticCache(max_size=100, threshold=0.9)
    vec = _unit_vec(seed=2)
    cache.put(vec, "本科", {"answer": "undergrad"})
    cache.put(vec, "专科", {"answer": "associate"})

    assert cache.get(vec, "本科")["answer"] == "undergrad"
    assert cache.get(vec, "专科")["answer"] == "associate"
    assert cache.get(vec, None) is None   # None != "本科"


def test_similar_vector_hits():
    """高度相似但非完全相同的向量应命中（threshold=0.9）。"""
    cache = SemanticCache(max_size=100, threshold=0.9)
    v = np.array(_unit_vec(seed=3), dtype=np.float32)
    noise = np.random.RandomState(99).randn(1024).astype(np.float32) * 0.01
    v_noisy = v + noise
    v_noisy /= np.linalg.norm(v_noisy)

    cache.put(v.tolist(), None, {"answer": "base"})
    hit = cache.get(v_noisy.tolist(), None)
    assert hit is not None, "高相似向量（sim≈0.99）应命中"


# ─── B5：TTFT 延迟 ────────────────────────────────────────────────────────────

def test_b5_cache_hit_latency_under_100ms():
    """B5：缓存命中 TTFT P95 < 100ms（进程内纯内存操作）。"""
    cache = SemanticCache(max_size=200, threshold=0.9)
    # 预填 50 条
    for i in range(50):
        cache.put(_unit_vec(seed=i), None, {"answer": f"ans_{i}"})

    target_vec = _unit_vec(seed=0)  # 必中第一条
    latencies = []
    for _ in range(50):
        t0 = time.perf_counter()
        cache.get(target_vec, None)
        latencies.append((time.perf_counter() - t0) * 1000)

    latencies.sort()
    p95 = latencies[int(len(latencies) * 0.95)]
    assert p95 < 100, f"缓存命中 P95={p95:.2f}ms 超过 100ms 预算"


# ─── B5：命中率 ───────────────────────────────────────────────────────────────

def test_b5_hit_rate_over_30_percent():
    """B5：10条高频查询各重复10次，命中率应 > 30%。"""
    cache = SemanticCache(max_size=500, threshold=0.92)
    query_vecs = [_unit_vec(seed=i) for i in range(10)]

    hits = misses = 0
    for i in range(100):
        q = query_vecs[i % 10]
        result = cache.get(q, None)
        if result is None:
            misses += 1
            cache.put(q, None, {"answer": f"q{i % 10}", "sources": []})
        else:
            hits += 1

    rate = hits / (hits + misses)
    assert rate > 0.30, f"命中率 {rate:.0%} < 30%"


# ─── B6：缓存失效 ─────────────────────────────────────────────────────────────

def test_b6_invalidate_all_clears_cache():
    """B6：invalidate() 无参数时清空全部缓存。"""
    cache = SemanticCache(max_size=100, threshold=0.9)
    vec = _unit_vec(seed=4)
    cache.put(vec, None, {"answer": "before"})

    cache.invalidate()

    assert cache.get(vec, None) is None
    assert cache.size == 0


def test_b6_invalidate_by_reg_id():
    """B6：invalidate(reg_ids) 只清除涉及指定 reg_id 的条目。"""
    cache = SemanticCache(max_size=100, threshold=0.9)
    v1, v2 = _unit_vec(seed=5), _unit_vec(seed=6)
    cache.put(v1, None, {"answer": "r1", "sources": ["REG-001"]})
    cache.put(v2, None, {"answer": "r2", "sources": ["REG-002"]})

    cache.invalidate(reg_ids=["REG-001"])

    assert cache.get(v1, None) is None   # REG-001 已清除
    assert cache.get(v2, None) is not None  # REG-002 仍在


@pytest.mark.integration
def test_b6_rebuild_triggers_invalidation():
    """B6：vector_index.rebuild() 调用后缓存应清空（通过 invalidate_hook）。"""
    import rag.vector_index as vi
    cache = get_cache()
    vec = _unit_vec(seed=7)
    cache.put(vec, None, {"answer": "cached"})

    vi.rebuild()  # 应触发 cache.invalidate()

    assert cache.get(vec, None) is None, "rebuild() 后缓存应被清空"


# ─── LRU 容量控制 ─────────────────────────────────────────────────────────────

def test_lru_eviction_respects_max_size():
    """超出容量时最旧条目被驱逐。"""
    cache = SemanticCache(max_size=3, threshold=0.9)
    vecs = [_unit_vec(seed=i) for i in range(4)]
    for i, v in enumerate(vecs):
        cache.put(v, None, {"answer": str(i)})

    assert cache.size == 3  # 超出容量后维持 max_size

    # 最旧条目（seed=0）应已被驱逐
    assert cache.get(vecs[0], None) is None
    # 最新条目（seed=3）应仍在
    assert cache.get(vecs[3], None) is not None
