# -*- coding: utf-8 -*-
"""点5：确定性锚定检索指标（Recall@k / Precision / MRR / 答案证据锚定）单测。
纯函数、无 LLM judge、无 DB/网络。金标锚点(expect_reg_ids/kp_ids)为空时应返回不可测(None)。"""
from unittest.mock import patch
from eval.ragas_eval import (
    _score_anchored_retrieval, _extract_cited_regs, _summarize_anchored, evaluate_one,
    _cn2int, _extract_cited_articles,
)


def test_cn2int():
    assert _cn2int("九") == 9
    assert _cn2int("十") == 10
    assert _cn2int("十一") == 11
    assert _cn2int("二十") == 20
    assert _cn2int("一百八十七") == 187
    assert _cn2int("二百二十四") == 224
    assert _cn2int("三百零五") == 305
    assert _cn2int("三百") == 300


def test_extract_cited_articles():
    assert _extract_cited_articles("依据第一百八十七条，物料平衡；第九条也相关。") == {187, 9}
    assert _extract_cited_articles("【条款编号】第二十条") == {20}
    assert _extract_cited_articles("没有引用") == set()
    assert _extract_cited_articles("") == set()


def test_grounding_matches_chinese_article_citation():
    """答案用'第X条'引用 → 应能命中主规范金标 reg_id（按条号），不再漏判为0。"""
    d = _score_anchored_retrieval(
        sources=["REG-GMP2010-A187", "REG-GMP2010-A011"],
        expect_reg_ids=["REG-GMP2010-A187", "REG-GMP2010-A999"],
        expect_kp_ids=[],
        answer="【条款编号】第一百八十七条 每批产品应当检查产量和物料平衡。",
    )
    ag = d["answer_grounding"]
    assert ag["grounding_recall"] == 0.5           # A187 经"第一百八十七条"命中；A999 未引 → 1/2
    assert "REG-GMP2010-A187" in ag["cited_gold_hits"]


def test_recall_at_3_in_default_ks():
    d = _score_anchored_retrieval(["X1", "X2", "X3", "X4"], ["X4"], [], "")
    assert "3" in d["recall_at_k"], "默认应含 recall@3"
    assert d["recall_at_k"]["3"] == 0.0            # X4 不在 top3
    assert d["recall_at_k"]["5"] == 1.0


def test_extract_cited_regs():
    a = "根据 REG-GMP2010-A187 和 REG-APP-FL-009 的规定。"
    assert _extract_cited_regs(a) == ["REG-APP-FL-009", "REG-GMP2010-A187"]
    assert _extract_cited_regs("") == []
    assert _extract_cited_regs("没有引用任何条款") == []


def test_anchored_metrics_basic():
    # 排序后的检索结果（rank 1..4），混 reg 与 kp
    sources = ["REG-GMP2010-A007", "KP-ZJ-026", "REG-GMP2010-A187", "REG-GMP2010-A011"]
    d = _score_anchored_retrieval(
        sources,
        expect_reg_ids=["REG-GMP2010-A187"],
        expect_kp_ids=["KP-ZJ-026"],
        answer="依据 REG-GMP2010-A187，物料平衡应符合限度。",
        ks=(2, 3),
    )
    assert d["measurable"] is True
    assert d["n_gold"] == 2 and d["n_retrieved"] == 4
    assert sorted(d["hits"]) == ["KP-ZJ-026", "REG-GMP2010-A187"]
    assert d["recall"] == 1.0                     # 2 命中 / 2 金标
    assert d["precision"] == 0.5                   # 2 命中 / 4 检索
    assert d["first_hit_rank"] == 2                # KP-ZJ-026 在第2位
    assert d["mrr"] == 0.5
    assert d["recall_at_k"]["2"] == 0.5            # top2 只命中 KP-ZJ-026
    assert d["recall_at_k"]["3"] == 1.0            # top3 两个都进
    # 答案证据锚定：引用了正确条款
    ag = d["answer_grounding"]
    assert ag["cited_regs"] == ["REG-GMP2010-A187"]
    assert ag["cited_gold_hits"] == ["REG-GMP2010-A187"]
    assert ag["grounding_recall"] == 1.0
    assert ag["cited_not_retrieved"] == []


def test_anchored_miss_and_bad_citation():
    sources = ["REG-GMP2010-A007", "REG-GMP2010-A011"]   # 都不是金标
    d = _score_anchored_retrieval(
        sources,
        expect_reg_ids=["REG-GMP2010-A187"],
        expect_kp_ids=[],
        answer="依据 REG-GMP2010-A999 作答。",           # 引用了未检索到的条款
        ks=(2,),
    )
    assert d["recall"] == 0.0                      # 完全没命中
    assert d["mrr"] == 0.0 and d["first_hit_rank"] is None
    assert d["recall_at_k"]["2"] == 0.0
    ag = d["answer_grounding"]
    assert ag["grounding_recall"] == 0.0           # 没引对金标条款
    assert ag["cited_not_retrieved"] == ["REG-GMP2010-A999"]  # 引用了没检索到的（幻觉嫌疑）


def test_anchored_not_measurable_when_no_gold():
    """金标锚点全空（当前专家未审核态）→ 不可测，检索指标返回 None，但答案引用观测仍在。"""
    d = _score_anchored_retrieval(
        ["REG-GMP2010-A007"],
        expect_reg_ids=[], expect_kp_ids=[],
        answer="引用 REG-GMP2010-A007。",
    )
    assert d["measurable"] is False
    assert d["recall"] is None and d["precision"] is None and d["mrr"] is None
    assert d["first_hit_rank"] is None
    # 答案引用的可观测字段仍产出（不依赖金标）
    assert d["answer_grounding"]["cited_regs"] == ["REG-GMP2010-A007"]
    assert d["answer_grounding"]["grounding_recall"] is None


def test_evaluate_one_wires_anchored():
    """evaluate_one 把锚定指标接进输出（离线：mock _llm + 注入 ask_fn）。"""
    rec = {"id": "T", "question": "q", "answer_points": ["p"],
           "expect_reg_ids": ["REG-GMP2010-A187"], "expect_kp_ids": []}

    def ask_fn(q, el):
        return {"answer": "依据 REG-GMP2010-A187 作答。",
                "sources": ["REG-GMP2010-A187", "REG-GMP2010-A011"],
                "contexts": ["c1", "c2"], "gen_contexts": ["g1"]}

    with patch("eval.ragas_eval._llm", return_value="YES"):
        r = evaluate_one(rec, ask_fn=ask_fn)

    assert r["expect_reg_ids"] == ["REG-GMP2010-A187"]
    assert r["anchored"]["measurable"] is True
    assert r["anchored"]["recall"] == 1.0
    assert r["anchored"]["mrr"] == 1.0                 # 正解在第1位
    assert r["anchored"]["answer_grounding"]["grounding_recall"] == 1.0


def test_summarize_anchored_aggregates_and_empty():
    valid = [
        {"anchored": {"measurable": True, "recall": 1.0, "precision": 0.5, "mrr": 1.0,
                      "recall_at_k": {"5": 1.0},
                      "answer_grounding": {"cited_regs": ["REG-A-1"], "cited_articles": [],
                                           "cited_not_retrieved": [], "grounding_recall": 1.0}}},
        {"anchored": {"measurable": False,
                      "answer_grounding": {"cited_regs": [], "cited_articles": [],
                                           "cited_not_retrieved": ["REG-B-2"]}}},
    ]
    s = _summarize_anchored(valid)
    assert s["n_measurable"] == 1
    assert s["recall"] == 1.0 and s["mrr"] == 1.0
    assert s["answer_citation_observability"]["n_cited_but_not_retrieved"] == 1

    s2 = _summarize_anchored([{"anchored": {"measurable": False,
                              "answer_grounding": {"cited": [], "cited_not_retrieved": []}}}])
    assert s2["n_measurable"] == 0 and "note" in s2
