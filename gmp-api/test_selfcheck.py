# -*- coding: utf-8 -*-
"""D4: SelfCheckGPT 单元测试（注入 mock LLM，不调 DashScope）。"""
import pytest
from eval.selfcheck import consistency_score, check_consistency


# ── consistency_score 纯函数 ─────────────────────────────────────────────────

def test_consistency_score_identical_answers():
    """5 条完全相同的答案 → 一致性应接近 1.0。"""
    answer = "A级洁净区悬浮粒子≥0.5μm应不超过3520个/m³。"
    answers = [answer] * 5
    score = consistency_score(answers)
    assert score >= 0.9, f"相同答案一致性应≥0.9，得 {score:.3f}"


def test_consistency_score_divergent_answers():
    """5 条内容完全不同的答案 → 一致性应低于 0.3。"""
    answers = [
        "洁净区分A、B、C、D四个级别。",
        "温度应保持在18-26摄氏度之间。",
        "生产线需要定期进行清洁验证。",
        "质量管理部门负责药品放行审批。",
        "制药用水分为饮用水、纯化水和注射用水。",
    ]
    score = consistency_score(answers)
    assert score < 0.3, f"差异答案一致性应<0.3，得 {score:.3f}"


def test_consistency_score_single_answer():
    """单条答案 → 一致性为 1.0（无法比较，默认稳定）。"""
    score = consistency_score(["任意答案"])
    assert score == 1.0


def test_consistency_score_range():
    """任意输入，一致性分数在 [0, 1] 范围内。"""
    import random, string
    for _ in range(10):
        answers = [
            "".join(random.choices(string.ascii_lowercase + " ", k=50))
            for _ in range(5)
        ]
        score = consistency_score(answers)
        assert 0.0 <= score <= 1.0, f"分数越界: {score}"


# ── check_consistency（注入 mock_llm 绕开 DashScope）───────────────────────

def test_check_consistency_stable_case():
    """mock_llm 每次返回同一答案 → is_stable=True。"""
    fixed = "A级洁净区悬浮粒子要求每立方米不超过3520个。"
    mock_llm = lambda q: fixed
    result = check_consistency("洁净区A级标准是什么", n=5, llm_fn=mock_llm)
    assert result["is_stable"] is True
    assert result["score"] >= 0.9
    assert len(result["samples"]) == 5


def test_check_consistency_unstable_case():
    """mock_llm 每次返回不同答案 → is_stable=False。"""
    answers = [
        "A级3520个/m³，B级3520，C级352000，D级不限。",
        "温度要求在20-25摄氏度之间。",
        "洁净区需安装高效过滤器HEPA。",
        "微生物监测频率为每周一次。",
        "质量管理部门负责洁净区监测结果的审查。",
    ]
    idx = [0]

    def mock_llm(q):
        ans = answers[idx[0] % len(answers)]
        idx[0] += 1
        return ans

    result = check_consistency("洁净区A级标准是什么", n=5, llm_fn=mock_llm)
    assert result["is_stable"] is False
    assert result["score"] < 0.5


def test_check_consistency_result_keys():
    """check_consistency 返回字典包含 score / is_stable / samples 键。"""
    mock_llm = lambda q: "固定答案"
    result = check_consistency("问题", n=3, llm_fn=mock_llm)
    assert "score" in result
    assert "is_stable" in result
    assert "samples" in result
