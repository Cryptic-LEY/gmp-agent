# -*- coding: utf-8 -*-
"""
P2 验收：min-max 归一化 + 0.6/0.4 加权融合（mock MySQL，无 DB，纯逻辑）。
"""
import inspect

import config
from rag.retriever import _fuse_scores, retrieve


def test_fuse_both_paths_normalize_correctly():
    """双路命中同一组 id：各自 min-max 归一化后按权融合。"""
    vec  = {"A": 0.9, "B": 0.5}
    bm25 = {"A": 0.8, "B": 0.3}
    result = _fuse_scores(vec, bm25, 0.6, 0.4)
    # vec_norm: A=1.0, B=0.0 (span=0.4)
    # bm25_norm: A=1.0, B=0.0 (span=0.5)
    # A: 0.6*1+0.4*1 = 1.0;  B: 0.6*0+0.4*0 = 0.0
    assert abs(result["A"] - 1.0) < 1e-6, f"A expected 1.0, got {result['A']}"
    assert abs(result["B"] - 0.0) < 1e-6, f"B expected 0.0, got {result['B']}"


def test_fuse_vec_only_weight():
    """id_A 只在向量路命中（BM25 路无此 id）：final = 0.6 * vec_norm_A。"""
    vec  = {"A": 0.9, "X": 0.5}   # 两项 → min-max 非平凡
    bm25 = {"B": 0.8, "Y": 0.3}   # 完全不同的 id
    result = _fuse_scores(vec, bm25, 0.6, 0.4)
    # A: vec_norm=1.0, bm25_norm=0.0 → 0.6*1.0 = 0.6
    assert abs(result["A"] - 0.6) < 1e-6, f"A (vec-only) expected 0.6, got {result['A']}"


def test_fuse_bm25_only_weight():
    """id_B 只在 BM25 路命中（向量路无此 id）：final = 0.4 * bm25_norm_B。"""
    vec  = {"A": 0.9, "X": 0.5}
    bm25 = {"B": 0.8, "Y": 0.3}
    result = _fuse_scores(vec, bm25, 0.6, 0.4)
    # B: vec_norm=0.0, bm25_norm=1.0 → 0.4*1.0 = 0.4
    assert abs(result["B"] - 0.4) < 1e-6, f"B (bm25-only) expected 0.4, got {result['B']}"


def test_fusion_weights_sum_to_one():
    """config 中 RAG_FUSION_VEC_WEIGHT + RAG_FUSION_BM25_WEIGHT == 1.0。"""
    total = config.RAG_FUSION_VEC_WEIGHT + config.RAG_FUSION_BM25_WEIGHT
    assert abs(total - 1.0) < 1e-9, f"fusion weights sum = {total}, expected 1.0"


def test_retrieve_signature_unchanged():
    """retrieve() 对外签名不变（回归）。"""
    params = list(inspect.signature(retrieve).parameters.keys())
    assert "question" in params
    assert "edu_level" in params
    assert "query_vec" in params
