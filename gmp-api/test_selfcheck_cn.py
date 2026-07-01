# -*- coding: utf-8 -*-
"""
P4 验收：SelfCheck 字符 bigram Jaccard（纯本地，零网络）。
"""
from eval.selfcheck import _text_similarity, consistency_score


def test_identical_sentences_score_one():
    """完全相同的句子 → similarity == 1.0。"""
    s = "无菌生产区域必须保持正压"
    assert _text_similarity(s, s) == 1.0


def test_similar_gmp_sentences_score_above_unrelated():
    """语义相近句对的 bigram 相似度高于不相关句对（相近 > 不相关，且 > 0.1）。"""
    similar   = _text_similarity("无菌生产区域必须保持正压", "洁净区必须维持正压环境")
    unrelated = _text_similarity("无菌区正压保持",          "原料药批生产记录应完整填写")
    assert similar > unrelated, f"相近({similar:.4f}) 应 > 不相关({unrelated:.4f})"
    assert similar > 0.1, f"相近句对 bigram 相似度应 > 0.1，实际 {similar:.4f}"


def test_unrelated_sentences_score_below_threshold():
    """完全不相关的句对 similarity < 0.15。"""
    a = "无菌区正压保持"
    b = "原料药批生产记录应完整填写"
    score = _text_similarity(a, b)
    assert score < 0.15, f"不相关句对期望 < 0.15，实际 {score:.4f}"


def test_consistency_score_identical_answers():
    """三条相同答案 → consistency_score == 1.0。"""
    assert consistency_score(["a", "a", "a"]) == 1.0


def test_no_split_in_similarity_source():
    """验证 selfcheck.py 的 _text_similarity 不再使用 split() 计算相似度。"""
    from pathlib import Path
    src = (Path(__file__).parent / "eval" / "selfcheck.py").read_text(encoding="utf-8")
    # _bigrams 函数内不允许出现 .split()
    bigram_fn_start = src.find("def _bigrams")
    text_sim_start  = src.find("def _text_similarity")
    segment = src[bigram_fn_start:text_sim_start + 300]
    assert ".split()" not in segment, "_text_similarity 仍含 .split() 词级逻辑"
