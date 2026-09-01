# -*- coding: utf-8 -*-
"""Agent 复核漏洞修复：revise 后必须重新复核（revise→critique），
预算用尽仍有问题则如实降级、绝不静默输出"看似正常"的答案。覆盖非流式图 + 流式路径。
全部 mock，无网络/DB。"""
from unittest.mock import patch
import agents.tutor as tutor
from agents.tutor import (
    node_revise, node_respond, node_critique, _should_revise, _critique_answer,
    build_tutor_graph, _DEGRADE_NOTICE,
)


def test_node_revise_writes_draft_answer_not_final():
    """修订结果写回 draft_answer（供重新复核），而非直接 final_answer；step+1。"""
    with patch.object(tutor, "_llm_chat", return_value="修订后的答案"):
        out = node_revise({"critic_issues": "有问题", "draft_answer": "原答案", "step": 1})
    assert out["draft_answer"] == "修订后的答案"
    assert "final_answer" not in out
    assert out["step"] == 2


def test_node_respond_clean_vs_degrade():
    """无问题→原样定稿；有未解决问题→附降级提示，不静默输出。"""
    clean = node_respond({"draft_answer": "好答案", "critic_issues": ""})
    assert clean["final_answer"] == "好答案"
    assert _DEGRADE_NOTICE not in clean["final_answer"]

    degraded = node_respond({"draft_answer": "可疑答案", "critic_issues": "与法规矛盾"})
    assert degraded["final_answer"].startswith("可疑答案")
    assert _DEGRADE_NOTICE in degraded["final_answer"]


def test_should_revise_respects_budget():
    assert _should_revise({"critic_issues": "x", "step": 0}) == "revise"
    assert _should_revise({"critic_issues": "x", "step": 5}) == "respond"   # 预算用尽
    assert _should_revise({"critic_issues": "", "step": 0}) == "respond"    # 无问题


def test_graph_revise_loops_back_to_critique():
    """图连线：revise → critique（重新复核），不再 revise → END。"""
    pairs = {(e.source, e.target) for e in build_tutor_graph().get_graph().edges}
    assert ("revise", "critique") in pairs, "revise 应回到 critique 重新复核"
    assert ("revise", "__end__") not in pairs, "revise 不应直接结束（跳过复核）"


def test_critique_answer_catches_hallucination_deterministically():
    """_critique_answer：引用了未检索到的条款 → 确定性判为问题（不调 LLM）。"""
    issue = _critique_answer("依据 REG-FAKE-9 的规定作答。", reg_context="",
                             retrieved_ids={"REG-REAL-1"})
    assert issue, "应检出幻觉条款"
    # 干净答案 + 无法规上下文 → 通过
    assert _critique_answer("这是一段没有条款引用的答案。", reg_context="",
                            retrieved_ids={"REG-REAL-1"}) == ""


def _bad_setup(monkeypatch):
    """检索返回真实条款，但生成/修订始终引用一个幻觉条款 → 永远无法通过复核。"""
    fake_docs = [tutor.DocChunk("REG-REAL-1", "regulation", "第一条", "GMP 要求某某。", 0.9)]
    monkeypatch.setattr(tutor, "retrieve", lambda q, edu_level=None, query_vec=None: fake_docs)
    monkeypatch.setattr(tutor, "_llm_chat", lambda *a, **k: "根据 REG-FAKE-999 的规定作答。")
    monkeypatch.setattr(tutor, "_llm_chat_stream",
                        lambda *a, **k: iter(["根据 REG-FAKE-999 的规定作答。"]))
    monkeypatch.setattr(tutor, "SEMANTIC_CACHE_ENABLED", False)   # 免 embed 网络
    monkeypatch.setattr(tutor, "log_query", lambda **k: None)


def test_ask_tutor_degrades_instead_of_silent_bad_answer(monkeypatch):
    """非流式：修订稿仍有幻觉 → 预算用尽后降级提示，绝不静默输出坏答案。"""
    _bad_setup(monkeypatch)
    out = tutor.ask_tutor("什么是GMP？")
    assert _DEGRADE_NOTICE in out["answer"], "最终答案应带降级提示（已重新复核过修订稿）"
    # critic_triggered 保持原语义："曾触发复核"（本例确实触发过）
    assert out["critic_triggered"] is True


def test_node_critique_tracks_critic_ever():
    """node_critique：有问题→置 critic_ever=True；无问题→不置（供 critic_triggered 保持原语义）。"""
    reg_state = {"retrieved_docs": [{"id": "REG-REAL-1", "doc_type": "regulation",
                                     "title": "t", "content": "c"}]}
    # 幻觉条款 → 确定性判问题（不调 LLM）
    bad = node_critique({**reg_state, "draft_answer": "依据 REG-FAKE-9 作答。"})
    assert bad["critic_issues"] and bad.get("critic_ever") is True
    # 干净答案 + LLM 判 PASS + 关 CoVe → 无问题、不置 critic_ever
    with patch.object(tutor, "_llm_chat", return_value="PASS"), \
         patch.object(tutor, "COVE_ENABLED", False):
        good = node_critique({**reg_state, "draft_answer": "无条款引用的干净答案。"})
    assert good["critic_issues"] == "" and "critic_ever" not in good


def test_stream_degrades_instead_of_silent_bad_answer(monkeypatch):
    """流式：修订稿也必须复核；坏到底 → 最终流出的答案带降级提示。"""
    import json as _json
    _bad_setup(monkeypatch)
    # 解析 SSE，把 chunk 重组回完整答案（chunk 被切成8字/块且 \n 被 JSON 转义）
    answer = ""
    for sse in tutor.ask_tutor_stream("什么是GMP？"):
        for line in sse.splitlines():
            if line.startswith("data: "):
                obj = _json.loads(line[6:])
                if "chunk" in obj:
                    answer += obj["chunk"]
    assert _DEGRADE_NOTICE in answer, "流式最终答案应带降级提示（修订稿经复核）"
