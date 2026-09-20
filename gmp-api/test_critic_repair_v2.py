# -*- coding: utf-8 -*-
"""Critic/Revise 可收敛修复 V2 单元测试（05-critic-revise-hardening）。

全部为纯单元/桩测试：不访问真实 LLM、不访问 MySQL、不联网。
V2 默认关；这些测试通过 monkeypatch 显式打开 TUTOR_REPAIR_V2_ENABLED。
"""
import hashlib
import json

import pytest
from langchain_core.messages import HumanMessage

import agents.tutor as T


def _docs():
    """7 条法规 + 2 条知识点；法规按 A001..A007 顺序（用于验证 V2 突破 legacy top-5）。"""
    reg = [
        ("REG-GMP2010-A001", "一", "企业应当建立质量管理体系，确保药品质量。"),
        ("REG-GMP2010-A002", "二", "企业应当配备足够的、符合资质的人员。"),
        ("REG-GMP2010-A003", "三", "厂房与设施应当保持清洁并防止污染。"),
        ("REG-GMP2010-A004", "四", "生产设备应当定期确认与校准。"),
        ("REG-GMP2010-A005", "五", "物料与产品应当符合注册批准的标准。"),
        ("REG-GMP2010-A006", "六", "文件系统应当完整、可追溯并受控管理。"),
        ("REG-GMP2010-A007", "七", "批记录应当及时、真实、完整地填写。"),
    ]
    docs = [{"id": i, "doc_type": "regulation", "title": t, "content": c,
             "score": 0.9 - k * 0.08} for k, (i, t, c) in enumerate(reg)]
    docs += [
        {"id": "KP-BK-001", "doc_type": "kp", "title": "kp1", "content": "质量管理体系的基本概念。", "score": 0.2},
        {"id": "KP-BK-002", "doc_type": "kp", "title": "kp2", "content": "人员职责的基本概念。", "score": 0.1},
    ]
    return docs


def _state(docs, question="什么是质量管理体系"):
    return {
        "messages": [HumanMessage(content=question)],
        "edu_level": None, "retrieved_docs": docs, "query_vec": None, "user_id": None,
        "profile_hint": "", "summary": "", "current_state": {}, "step": 0,
        "timings_ms": T._new_timings(), "stage_counts": T._new_stage_counts(),
    }


def test_v1_still_uses_legacy_path_when_flag_false(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", False)
    docs = _docs()
    ctx, ids = T._critic_evidence_context(_state(docs))
    # legacy：只取前 5 条法规 → 第 6/7 条 id 不在 critic 上下文里
    assert "REG-GMP2010-A001" in ctx
    assert "REG-GMP2010-A006" not in ctx
    assert "REG-GMP2010-A007" not in ctx
    # retrieved_ids 仍是全部
    assert ids == {d["id"] for d in docs}


def test_generate_and_critic_share_evidence_sha(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    monkeypatch.setattr(T, "_llm_chat", lambda *a, **k: "草稿答案")
    monkeypatch.setattr("eval.error_book.get_few_shot_negatives", lambda *a, **k: [])
    docs = _docs()
    out = T.node_generate(_state(docs))
    ev = T._prepare_tutor_evidence(docs)
    # Generate 产出的证据 sha == 独立构造的证据 sha（同一契约）
    assert out["evidence"]["context_sha256"] == ev["context_sha256"]
    # Critic 复用同一证据 → 上下文 sha 一致
    st2 = _state(docs)
    st2["evidence"] = out["evidence"]
    ctx, _ = T._critic_evidence_context(st2)
    assert hashlib.sha256(ctx.encode("utf-8")).hexdigest() == ev["context_sha256"]


def test_v1_generate_prompt_does_not_include_fix_hint_when_v2_disabled(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", False)
    monkeypatch.setattr(
        "eval.error_book.get_few_shot_negatives",
        lambda *a, **k: [{
            "bad_answer": "错误答案", "reason": "错误原因", "fix_hint": "V2修正提示",
        }],
    )
    captured = {}
    monkeypatch.setattr(
        T, "_llm_chat",
        lambda messages, **kwargs: captured.update(messages=messages) or "草稿答案",
    )

    T.node_generate(_state(_docs()))

    prompt = "\n".join(item["content"] for item in captured["messages"])
    assert "错误原因" in prompt
    assert "V2修正提示" not in prompt


def test_critic_v2_sees_all_generator_evidence_ids(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    docs = _docs()
    ev = T._prepare_tutor_evidence(docs)
    st = _state(docs)
    st["evidence"] = ev
    ctx, ids = T._critic_evidence_context(st)
    # 超出 legacy top-5 的第 6/7 条法规现在可见
    assert "REG-GMP2010-A006" in ctx
    assert "REG-GMP2010-A007" in ctx
    assert {"REG-GMP2010-A006", "REG-GMP2010-A007"} <= ids
    assert ids == {d["id"] for d in docs}


def test_partial_verbatim_quote_is_not_incomplete_quote():
    ev = T._prepare_tutor_evidence(_docs())
    # 连续逐字子串（部分摘录）不算错
    assert T._is_verbatim_excerpt("建立质量管理体系", ev) is True
    # 改写/乱序不是逐字片段
    assert T._is_verbatim_excerpt("质量体系的建立与管理", ev) is False


def test_answer_output_contract_shared_and_stable():
    c = T._answer_output_contract()
    assert "禁止" in c and "REG-、KP-" in c
    # Generate 系统提示必须内含同一份约束（Generate/Revise 共用，防漂移）
    msgs = T._build_generate_messages("参考资料X", "问题Y", history=None, edu_level=None)
    assert c in msgs[0]["content"]


# ── Task 2：确定性契约 + 结构化 Critic ───────────────────────────────────────
def _decision(issues, passed=None, source="llm"):
    return {"passed": passed if passed is not None else not issues, "issues": issues,
            "raw_response": "", "context_sha256": "x", "decision_source": source}


def test_any_internal_id_is_contract_violation_even_if_retrieved():
    ev = T._prepare_tutor_evidence(_docs())          # REG-GMP2010-A001 在检索结果内
    draft = "根据 REG-GMP2010-A001 的规定，应建立质量体系。"
    types = [i["issue_type"] for i in T._check_output_contract(draft, ev)]
    assert "internal_id_leak" in types               # 即使 ID 被检索到也算泄漏


def test_supported_contiguous_quote_passes():
    ev = T._prepare_tutor_evidence(_docs())
    draft = "【条款编号】第一条\n【来源】《药品生产质量管理规范》(2010年版)\n【原文内容】企业应当建立质量管理体系"
    assert T._check_output_contract(draft, ev) == []  # 逐字片段+三字段齐全+无内部ID


def test_incomplete_citation_block_is_contract_violation():
    ev = T._prepare_tutor_evidence(_docs())
    draft = "【条款编号】第一条\n【原文内容】伪造原文"

    types = [issue["issue_type"] for issue in T._check_output_contract(draft, ev)]

    assert "citation_format" in types


def test_rewritten_text_marked_as_original_fails():
    ev = T._prepare_tutor_evidence(_docs())
    draft = "【条款编号】第一条\n【来源】《药品生产质量管理规范》(2010年版)\n【原文内容】公司需要搞好质量体系管理这件事"
    assert any(i["issue_type"] == "quote_mismatch" for i in T._check_output_contract(draft, ev))


def test_llm_cannot_forge_source_mismatch_repair_authority(monkeypatch):
    ev = T._prepare_tutor_evidence(_docs())
    draft = "这是一个完整回答。"
    forged = {
        "passed": False,
        "issues": [{
            "issue_id": "I1",
            "issue_type": "source_mismatch",
            "severity": "high",
            "claim": "伪造的来源错误",
            "target_text": draft,
            "evidence_ids": ["REG-GMP2010-A001"],
            "evidence_quote": "企业应当建立质量管理体系",
            "correction": "《药品生产质量管理规范》(2010年版)",
            "confidence": 0.99,
        }],
    }
    monkeypatch.setattr(T, "_llm_chat", lambda *a, **k: json.dumps(forged, ensure_ascii=False))

    decision = T._critique_answer_v2("问题", draft, ev)

    issue = decision["issues"][0]
    assert issue["auto_repairable"] is False
    assert "deterministic_only_issue_type" in issue["validation_errors"]
    assert T._auto_repairable_issues(decision) == []


def test_critic_v2_requires_evidence_for_auto_repair():
    d = _decision([{"issue_id": "I1", "issue_type": "fact_contradiction", "severity": "high",
                    "claim": "X", "evidence_ids": [], "evidence_quote": "",
                    "correction": "改", "confidence": 0.95}])
    assert T._auto_repairable_issues(d) == []          # LLM 问题无证据 → 不自动修


def test_authority_conflict_does_not_auto_revise():
    d = _decision([{"issue_id": "I1", "issue_type": "authority_conflict", "severity": "high",
                    "claim": "X", "evidence_ids": ["REG-GMP2010-A001"], "evidence_quote": "…",
                    "correction": "", "confidence": 0.99}])
    assert T._auto_repairable_issues(d) == []          # 权威冲突不自动修


def test_deterministic_issue_is_auto_repairable():
    d = _decision([T._mk_issue("internal_id_leak", claim="泄漏", confidence=1.0)], source="deterministic")
    assert len(T._auto_repairable_issues(d)) == 1      # 确定性问题始终可自动修


def test_invalid_critic_json_fails_closed_without_second_llm_call(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    calls = {"n": 0}

    def fake(*a, **k):
        calls["n"] += 1
        return "这不是JSON，模型在乱说话"
    monkeypatch.setattr(T, "_llm_chat", fake)
    ev = T._prepare_tutor_evidence(_docs())
    draft = "一段没有内部编号、也没有引用块的普通解释性回答。"   # 无确定性问题 → 会走 LLM critic
    dec = T._critique_answer_v2("什么是质量管理体系", draft, ev)
    assert calls["n"] == 1                              # 解析失败不偷偷重试
    assert dec["passed"] is False
    assert any(i["issue_type"] == "critic_parse_error" for i in dec["issues"])


def test_critic_v2_parses_valid_json(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    good = ('{"passed": false, "issues": [{"issue_id":"I1","issue_type":"fact_contradiction",'
            '"severity":"high","claim":"温度写错","evidence_ids":["REG-GMP2010-A004"],'
            '"evidence_quote":"定期确认与校准","correction":"改为校准","confidence":0.9}]}')
    monkeypatch.setattr(T, "_llm_chat", lambda *a, **k: good)
    ev = T._prepare_tutor_evidence(_docs())
    dec = T._critique_answer_v2("问题", "无引用块的普通回答", ev)
    assert dec["passed"] is False and dec["decision_source"] == "llm"
    assert dec["issues"][0]["issue_type"] == "fact_contradiction"
    assert dec["context_sha256"] == ev["context_sha256"]


# ── Task 3：有证据的最小 Revise ──────────────────────────────────────────────
def _mk_decision_for_revise(target_text="当前答案"):
    return _decision([
        {"issue_id": "I1", "issue_type": "fact_contradiction", "severity": "high",
         "claim": "温度声明与证据不符", "target_text": target_text,
         "evidence_ids": ["REG-GMP2010-A004"],
         "evidence_quote": "生产设备应当定期确认与校准", "correction": "定期确认与校准", "confidence": 0.95},
        {"issue_id": "I2", "issue_type": "authority_conflict", "severity": "high",
         "claim": "证据与常识冲突", "evidence_ids": ["REG-GMP2010-A001"], "evidence_quote": "…",
         "correction": "", "confidence": 0.99},
        {"issue_id": "I3", "issue_type": "fact_contradiction", "severity": "low",
         "claim": "低置信问题", "evidence_ids": ["REG-GMP2010-A002"], "evidence_quote": "…",
         "correction": "改", "confidence": 0.40},
    ])


def test_revise_v2_contains_question_evidence_issues_and_patch_contract():
    ev = T._prepare_tutor_evidence(_docs())
    msgs = T._build_revise_messages_v2(
        "原始问题Q", "当前答案草稿", _mk_decision_for_revise("当前答案草稿"), ev)
    p = msgs[0]["content"]
    assert "原始问题Q" in p
    assert "企业应当建立质量管理体系" in p            # 证据上下文
    assert "当前答案草稿" in p
    assert "定期确认与校准" in p                        # 可自动修订问题的 correction
    assert '"edits"' in p and '"operation":"replace"' in p
    assert "不得输出完整答案" in p


def test_revise_v2_excludes_low_confidence_and_authority_conflict():
    ev = T._prepare_tutor_evidence(_docs())
    p = T._build_revise_messages_v2("Q", "草稿", _mk_decision_for_revise("草稿"), ev)[0]["content"]
    assert "证据与常识冲突" not in p                    # authority_conflict 不进 revise
    assert "低置信问题" not in p                        # 低置信不进 revise
    assert "温度声明与证据不符" in p or "定期确认与校准" in p


def test_revise_v2_temperature_is_point_one(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    seen = {}
    wrong = "生产设备应当每月确认与校准"
    corrected = "生产设备应当定期确认与校准"
    monkeypatch.setattr(T, "_llm_chat",
                        lambda msgs, temperature=0.3, model=None: seen.update(t=temperature) or
                        '{"edits":[{"issue_id":"I1","operation":"replace",'
                        f'"target_text":"{wrong}","replacement_text":"{corrected}",'
                        '"evidence_ids":["REG-GMP2010-A004"]}]}')
    ev = T._prepare_tutor_evidence(_docs())
    st = _state(_docs())
    st["evidence"] = ev
    st["critic_decision"] = T._validate_critic_decision(
        _mk_decision_for_revise(wrong), wrong, ev)
    st["draft_answer"] = wrong
    out = T.node_revise(st)
    assert seen["t"] == 0.1
    assert out["draft_answer"] == corrected


def test_patch_replacement_must_be_grounded_in_selected_evidence():
    ev = T._prepare_tutor_evidence(_docs())
    decision = T._validate_critic_decision(
        _decision([T._mk_issue(
            "fact_contradiction",
            target_text="当前答案",
            evidence_ids=["REG-GMP2010-A004"],
            evidence_quote="生产设备应当定期确认与校准",
            correction="生产设备应当定期确认与校准",
            confidence=0.95,
            issue_id="I1",
        )]),
        "当前答案",
        ev,
    )
    edits = [{
        "issue_id": "I1", "operation": "replace", "target_text": "当前答案",
        "replacement_text": "设备温度必须达到999℃",
        "evidence_ids": ["REG-GMP2010-A004"],
    }]

    with pytest.raises(ValueError, match="replacement_not_expected"):
        T._apply_verified_patch("当前答案", edits, decision["issues"], ev)


def test_revise_v2_preserves_v1_prompt_when_flag_false(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", False)
    captured = {}
    monkeypatch.setattr(T, "_llm_chat",
                        lambda msgs, temperature=0.3, model=None: captured.update(m=msgs, t=temperature) or "V1修订")
    st = _state(_docs())
    st["draft_answer"] = "原答案"
    st["critic_issues"] = "某问题"
    out = T.node_revise(st)
    assert "原答案存在以下问题" in captured["m"][0]["content"]   # V1 prompt 不变
    assert captured["t"] == 0.3                                   # V1 温度不变
    assert out["draft_answer"] == "V1修订"


# ── Task 4：停滞、退化和最佳稿护栏 ──────────────────────────────────────────
_CRITIC_ISSUE_JSON = ('{"passed":false,"issues":[{"issue_id":"I1","issue_type":"fact_contradiction",'
                      '"severity":"high","claim":"某声明","target_text":"普通无引用块答案甲",'
                      '"evidence_ids":["REG-GMP2010-A004"],'
                      '"evidence_quote":"生产设备应当定期确认与校准","correction":"改","confidence":0.95}]}')


def test_same_draft_stops_after_one_revise_without_recritic(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    calls = {"n": 0}

    def fake(*a, **k):
        calls["n"] += 1
        return _CRITIC_ISSUE_JSON
    monkeypatch.setattr(T, "_llm_chat", fake)
    ev = T._prepare_tutor_evidence(_docs())
    st = _state(_docs())
    st["evidence"] = ev
    st["draft_answer"] = "普通答案草稿无引用块"
    out1 = T.node_critique(st)
    st.update(out1)
    n1 = calls["n"]
    out2 = T.node_critique(st)              # 同一稿再次进 critique
    assert calls["n"] == n1                 # 未再调用 critic LLM
    assert out2["termination_reason"] == "stalled_same_draft"


def test_repeated_issue_stops_at_configured_limit(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    monkeypatch.setattr(T, "_llm_chat", lambda *a, **k: _CRITIC_ISSUE_JSON)  # 每次同一问题
    ev = T._prepare_tutor_evidence(_docs())
    st = _state(_docs())
    st["evidence"] = ev
    st["draft_answer"] = "答案甲"
    st.update(T.node_critique(st))          # 第一次：sig 记录
    st["draft_answer"] = "答案乙（不同稿但同问题）"
    out = T.node_critique(st)               # 同一 sig 再现 → 超过 MAX_REPEAT_ISSUES(1)
    assert out["termination_reason"] == "stalled_repeated_issue"


def test_regressed_candidate_does_not_replace_best():
    ev = T._prepare_tutor_evidence(_docs())
    clean = "【条款编号】第一条\n【来源】GMP\n【原文内容】企业应当建立质量管理体系"
    dirty = clean + "\n另参见 REG-GMP2010-A001。"   # 引入内部 ID 泄漏 → 更差
    s_clean = T._score_candidate(clean, ev, clean)
    s_dirty = T._score_candidate(dirty, ev, clean)
    assert T._v2_better(s_clean, s_dirty) is True
    assert T._v2_better(s_dirty, s_clean) is False   # 退化候选不优于最佳


def test_budget_exhaustion_returns_best_not_last(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    ev = T._prepare_tutor_evidence(_docs())
    st = _state(_docs())
    st["evidence"] = ev
    st["draft_answer"] = "最后一稿更差"
    st["best_draft"] = "最佳稿初稿"
    st["step"] = T.TUTOR_REPAIR_MAX_REVISIONS
    st["critic_decision"] = _decision([T._mk_issue("fact_contradiction", claim="x",
                                                   evidence_ids=["a"], evidence_quote="q", confidence=0.95)])
    out = T.node_respond(st)
    assert "最佳稿初稿" in out["final_answer"] and "最后一稿更差" not in out["final_answer"]
    assert out["termination_reason"] == "budget_exhausted"
    assert out["final_answer"].endswith(T._DEGRADE_NOTICE)
    assert out["repair_warning"] == "budget_exhausted"


def test_v2_unverified_output_has_user_visible_degrade_notice(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    ev = T._prepare_tutor_evidence(_docs())
    draft = "引用仍待人工核对"
    st = _state(_docs())
    st.update({
        "evidence": ev,
        "draft_answer": draft,
        "best_draft": draft,
        "last_checked_draft_sha256": T._draft_sha256(draft),
        "termination_reason": "low_confidence_issue",
        "critic_decision": _decision([T._mk_issue(
            "fact_contradiction", claim="仍有未解决问题", confidence=0.4,
        )]),
    })

    out = T.node_respond(st)

    assert out["output_verified"] is False
    assert out["repair_warning"] == "low_confidence_issue"
    assert out["final_answer"].endswith(T._DEGRADE_NOTICE)


def test_patch_failure_routes_directly_to_respond():
    assert T._after_revise({"termination_reason": "patch_parse_error"}) == "respond"
    assert T._after_revise({"termination_reason": ""}) == "critique"


def test_tutor_limit_does_not_change_tool_agent_limit(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    from agents.limits import early_stop
    ev = T._prepare_tutor_evidence(_docs())
    st = _state(_docs())
    st["evidence"] = ev
    st["step"] = T.TUTOR_REPAIR_MAX_REVISIONS          # =2 < MAX_REASONING_STEPS(5)
    st["critic_decision"] = _decision([T._mk_issue("fact_contradiction", claim="x",
                                                   evidence_ids=["a"], evidence_quote="q", confidence=0.95)])
    assert early_stop(st["step"]) is False             # tool agent 口径下还没到上限
    assert T._should_revise(st) == "respond"           # 但 V2 用自身预算已停


def test_all_v2_termination_reasons_are_recorded(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    ev = T._prepare_tutor_evidence(_docs())

    def base():
        s = _state(_docs())
        s["evidence"] = ev
        s["draft_answer"] = "B"
        s["best_draft"] = "B"
        s["last_checked_draft_sha256"] = T._draft_sha256("B")
        return s
    s = base(); s["critic_decision"] = _decision([], passed=True)
    assert T.node_respond(s)["termination_reason"] == "passed"
    s = base(); s["critic_decision"] = _decision([T._mk_issue("authority_conflict", confidence=0.99,
                                                              evidence_ids=["a"], evidence_quote="q")])
    assert T.node_respond(s)["termination_reason"] == "authority_conflict"
    s = base(); s["critic_decision"] = _decision([T._mk_issue("fact_contradiction", confidence=0.1,
                                                              evidence_ids=["a"], evidence_quote="q")])
    assert T.node_respond(s)["termination_reason"] == "low_confidence_issue"
    s = base(); s["critic_decision"] = {"passed": False, "issues": [T._mk_issue("critic_parse_error")],
                                        "raw_response": "", "context_sha256": "x", "decision_source": "parse_error"}
    assert T.node_respond(s)["termination_reason"] == "critic_parse_error"
    s = base(); s["critic_decision"] = {"passed": False, "issues": [T._mk_issue("critic_parse_error")],
                                        "raw_response": "", "context_sha256": "x",
                                        "decision_source": "deterministic+parse_error"}
    assert T.node_respond(s)["termination_reason"] == "critic_parse_error"
    s = base(); s["termination_reason"] = "stalled_same_draft"
    s["critic_decision"] = _decision([T._mk_issue("fact_contradiction", confidence=0.9,
                                                  evidence_ids=["a"], evidence_quote="q")])
    assert T.node_respond(s)["termination_reason"] == "stalled_same_draft"


# ── Task 5：流式与图一致性（共用 _run_repair_loop_v2）────────────────────────
def _post_generate_state(draft):
    ev = T._prepare_tutor_evidence(_docs())
    return {
        "messages": [HumanMessage(content="什么是质量管理体系")],
        "evidence": ev, "draft_answer": draft, "initial_draft": draft,
        "retrieved_docs": _docs(), "step": 0,
        "timings_ms": T._new_timings(), "stage_counts": T._new_stage_counts(),
    }


def test_stream_and_graph_use_same_evidence_sha(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    monkeypatch.setattr(T, "_llm_chat", lambda *a, **k: "草稿")
    monkeypatch.setattr("eval.error_book.get_few_shot_negatives", lambda *a, **k: [])
    docs = _docs()
    graph_ev = T.node_generate(_state(docs))["evidence"]
    serial = [{"id": d["id"], "doc_type": d["doc_type"], "title": d["title"],
               "content": d["content"], "score": d["score"]} for d in docs]
    stream_ev = T._prepare_tutor_evidence(serial)      # 流式路径用同一函数
    assert graph_ev["context_sha256"] == stream_ev["context_sha256"]


def test_stream_and_graph_same_stub_outputs_same_answer(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)

    def fake(msgs, temperature=0.3, model=None):
        return "VERIFIED" if "验证专家" in msgs[0]["content"] else '{"passed":true,"issues":[]}'
    monkeypatch.setattr(T, "_llm_chat", fake)
    st = _post_generate_state("一段通过复核的普通回答")
    loop_out = T._run_repair_loop_v2(dict(st))
    # 手动按 LangGraph 边顺序驱动同一批节点
    g = dict(st)
    g.update(T.node_critique(g))
    while T._should_revise(g) == "revise":
        g.update(T.node_revise(g))
        g.update(T.node_critique(g))
    g.update(T.node_respond(g))
    assert loop_out["final_answer"] == g["final_answer"]
    assert loop_out["termination_reason"] == g["termination_reason"] == "passed"


def test_stream_same_draft_stops_without_recritic(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    calls = {"critic": 0}

    def fake(msgs, temperature=0.3, model=None):
        c = msgs[0]["content"]
        if "审核专家" in c:
            calls["critic"] += 1
            return ('{"passed":false,"issues":[{"issue_id":"I1",'
                    '"issue_type":"fact_contradiction","severity":"high",'
                    '"claim":"某声明","target_text":"生产设备应当定期确认与校准",'
                    '"evidence_ids":["REG-GMP2010-A004"],'
                    '"evidence_quote":"生产设备应当定期确认与校准",'
                    '"correction":"生产设备应当定期确认与校准","confidence":0.95}]}')
        return ('{"edits":[{"issue_id":"I1","operation":"replace",'
                '"target_text":"生产设备应当定期确认与校准",'
                '"replacement_text":"生产设备应当定期确认与校准",'
                '"evidence_ids":["REG-GMP2010-A004"]}]}')
    monkeypatch.setattr(T, "_llm_chat", fake)
    out = T._run_repair_loop_v2(_post_generate_state("生产设备应当定期确认与校准"))
    assert out["termination_reason"] == "stalled_same_draft"
    assert calls["critic"] == 1               # 同稿不再复核


def test_stream_returns_best_candidate_on_exhaustion(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    n = {"c": 0, "r": 0}
    wrong_targets = [
        "生产设备应当每月确认与校准",
        "生产设备应当每年确认与校准",
        "生产设备无需定期确认与校准",
    ]
    corrected = "生产设备应当定期确认与校准"

    def fake(msgs, temperature=0.3, model=None):
        c = msgs[0]["content"]
        if "审核专家" in c:
            n["c"] += 1
            targets = wrong_targets[n["c"] - 1:]
            return json.dumps({"passed": False, "issues": [{
                "issue_id": f"I{idx}", "issue_type": "fact_contradiction",
                "severity": "high", "claim": f"问题{target}", "target_text": target,
                "evidence_ids": ["REG-GMP2010-A004"],
                "evidence_quote": corrected,
                "correction": corrected,
                "confidence": 0.95,
            } for idx, target in enumerate(targets, start=n["c"])]}, ensure_ascii=False)
        n["r"] += 1
        target = wrong_targets[n["r"] - 1]
        return json.dumps({"edits": [{
            "issue_id": f"I{n['r']}", "operation": "replace",
            "target_text": target, "replacement_text": corrected,
            "evidence_ids": ["REG-GMP2010-A004"],
        }]}, ensure_ascii=False)
    monkeypatch.setattr(T, "_llm_chat", fake)
    out = T._run_repair_loop_v2(_post_generate_state("；".join(wrong_targets)))
    assert out["termination_reason"] == "budget_exhausted"
    assert out["final_answer"].startswith(f"{corrected}；{corrected}；{wrong_targets[2]}")
    assert out["final_answer"].endswith(T._DEGRADE_NOTICE)
    assert out["repair_warning"] == "budget_exhausted"


def test_stream_does_not_emit_unselected_draft(monkeypatch):
    # 缓冲式：最终答案只等于选定的最佳稿(±降级)，不含任何被丢弃的中间稿
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    n = {"r": 0}

    def fake(msgs, temperature=0.3, model=None):
        if "审核专家" in msgs[0]["content"]:
            return _CRITIC_ISSUE_JSON
        n["r"] += 1
        return f"被丢弃的更差中间稿REG-GMP2010-A002第{n['r']}版"
    monkeypatch.setattr(T, "_llm_chat", fake)
    out = T._run_repair_loop_v2(_post_generate_state("初稿内容X"))
    best = out["best_draft"]
    assert out["final_answer"] in (best, best + T._DEGRADE_NOTICE)
    assert "被丢弃的更差中间稿" not in out["final_answer"]
