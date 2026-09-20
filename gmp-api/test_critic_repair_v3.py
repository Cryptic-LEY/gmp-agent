# -*- coding: utf-8 -*-
"""Critic/Revise V3 regression tests.

These tests are offline: they use synthetic source artifacts and stubbed LLMs.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

import agents.tutor as T
from eval import critic_repair_eval as RE
from eval import critic_fault_injection as FI


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )


def _make_source_run(tmp_path: Path, *, retrieval_has_qid: bool = True,
                     generate_call_id: str = "call_0001") -> Path:
    source = tmp_path / "source"
    source.mkdir()
    docs = [{
        "id": "REG-GMP2010-A001",
        "rank": 1,
        "doc_type": "regulation",
        "title": "一",
        "content": "企业应当建立质量管理体系。",
        "score": 0.9,
    }]
    if retrieval_has_qid:
        docs[0]["qid"] = "EQ-001"
    serial = [{k: row[k] for k in ("id", "doc_type", "title", "content", "score")}
              for row in docs]
    evidence = T._prepare_tutor_evidence(serial)
    question = "什么是质量管理体系？"
    draft = "企业应当建立质量管理体系。"

    _write_jsonl(source / "dataset_snapshot.jsonl", [{
        "id": "EQ-001",
        "question": question,
        "answer_points": [draft],
        "expect_reg_ids": ["REG-GMP2010-A001"],
        "expect_kp_ids": [],
    }])
    _write_jsonl(source / "generation.jsonl", [{
        "id": "EQ-001",
        "draft": draft,
        "draft_sha256": hashlib.sha256(draft.encode("utf-8")).hexdigest(),
        "gen_contexts": [item["provided_content"] for item in evidence["items"]],
        "generate_call_ids": [generate_call_id],
    }])
    _write_jsonl(source / "retrieval_snapshot.jsonl", docs)
    _write_jsonl(source / "llm_calls.jsonl", [{
        "call_id": "call_0001",
        "call_type": "generate",
        "stage_tag": "generate",
        "messages": [{
            "role": "user",
            "content": f"参考资料：\n{evidence['context']}\n\n学生问题：{question}",
        }],
        "raw_response": {"choices": [{"message": {"content": draft}}]},
    }])
    (source / "manifest.json").write_text(
        json.dumps({"kind": "critic_ablation", "status": "complete"}),
        encoding="utf-8",
    )
    return source


def _rebuild_from_edits(original: str, edits: list[dict]) -> str:
    rebuilt = original
    for edit in sorted(edits, key=lambda item: item["start"], reverse=True):
        assert rebuilt[edit["start"]:edit["end"]] == edit["before"]
        rebuilt = rebuilt[:edit["start"]] + edit["after"] + rebuilt[edit["end"]:]
    return rebuilt


# Task 0: source recovery and preflight evidence
def test_source_recovery_never_uses_position_fallback(tmp_path):
    source = _make_source_run(tmp_path, retrieval_has_qid=False)
    call = json.loads((source / "llm_calls.jsonl").read_text(encoding="utf-8"))
    call["messages"][0]["content"] = "参考资料：\n无身份正文\n\n学生问题：什么是质量管理体系？"
    _write_jsonl(source / "llm_calls.jsonl", [call])

    recovered = RE.recover_source(str(source))

    assert recovered["records"] == {}
    assert recovered["unrecoverable"] == ["EQ-001"]


def test_source_recovery_requires_valid_generate_call_id(tmp_path):
    source = _make_source_run(tmp_path, generate_call_id="missing_call")

    recovered = RE.recover_source(str(source))

    assert recovered["records"] == {}
    assert recovered["unrecoverable"] == ["EQ-001"]


def test_source_recovery_accepts_unique_generate_call_and_matching_prompt(tmp_path):
    source = _make_source_run(tmp_path)

    recovered = RE.recover_source(str(source))

    assert recovered["unrecoverable"] == []
    assert recovered["records"]["EQ-001"]["initial_draft"] == "企业应当建立质量管理体系。"


def test_preflight_snapshot_contains_reproducibility_and_budget_fields(tmp_path):
    source = _make_source_run(tmp_path)
    baseline = tmp_path / "baseline"
    baseline.mkdir()
    (baseline / "manifest.json").write_text(
        json.dumps({"kind": "critic_repair_eval", "status": "complete"}),
        encoding="utf-8",
    )
    _write_jsonl(baseline / "llm_calls.jsonl", [{
        "call_id": "call_0001",
        "qid": "EQ-001",
        "arm": "v2",
        "execution_mode": "live",
        "usage": {"prompt_tokens": 100, "completion_tokens": 20, "total_tokens": 120},
    }])

    snapshot = RE.build_preflight_snapshot(
        str(source), str(baseline), ["EQ-001"], implementation="v3", cove_enabled=False,
    )

    assert snapshot["implementation_version"] == "v3"
    assert snapshot["source_run_path"] == str(source.resolve())
    assert snapshot["baseline_run_path"] == str(baseline.resolve())
    assert len(snapshot["dataset_sha256"]) == 64
    assert len(snapshot["source_run_manifest_sha256"]) == 64
    assert len(snapshot["baseline_run_manifest_sha256"]) == 64
    assert len(snapshot["baseline_run_llm_calls_sha256"]) == 64
    assert len(snapshot["git"]["tracked_diff_sha256"]) == 64
    assert snapshot["budget"]["historical_physical_calls"] == 1
    assert snapshot["budget"]["historical_total_tokens"] == 120
    assert snapshot["budget"]["worst_case_physical_calls"] == 5
    assert snapshot["budget"]["estimated_cost_cny"] > 0
    assert snapshot["budget"]["worst_case_cost_upper_bound_cny"] > 0
    assert snapshot["cove_enabled"] is False
    assert snapshot["config"]["TUTOR_REPAIR_V2_ENABLED"] is False
    assert snapshot["config"]["TUTOR_REPAIR_MAX_REVISIONS"] == T.TUTOR_REPAIR_MAX_REVISIONS
    assert snapshot["config"]["TUTOR_REPAIR_MIN_CONFIDENCE"] == T.TUTOR_REPAIR_MIN_CONFIDENCE


def test_preflight_snapshot_hash_changes_when_baseline_manifest_changes(tmp_path):
    source = _make_source_run(tmp_path)
    baseline = tmp_path / "baseline"
    baseline.mkdir()
    manifest = baseline / "manifest.json"
    manifest.write_text('{"status":"complete"}', encoding="utf-8")
    _write_jsonl(baseline / "llm_calls.jsonl", [])
    before = RE.build_preflight_snapshot(str(source), str(baseline), ["EQ-001"])

    manifest.write_text('{"status":"failed"}', encoding="utf-8")
    after = RE.build_preflight_snapshot(str(source), str(baseline), ["EQ-001"])

    assert before["baseline_run_manifest_sha256"] != after["baseline_run_manifest_sha256"]


def test_plan_cli_preflight_is_offline_and_creates_no_result_directory(tmp_path, monkeypatch):
    source = _make_source_run(tmp_path)
    baseline = tmp_path / "baseline"
    baseline.mkdir()
    (baseline / "manifest.json").write_text('{"status":"complete"}', encoding="utf-8")
    _write_jsonl(baseline / "llm_calls.jsonl", [])
    results = tmp_path / "results"
    monkeypatch.setattr(RE, "RESULTS_ROOT", results)

    rc = RE.main([
        "--source-run", str(source),
        "--baseline-run", str(baseline),
        "--implementation", "v3",
        "--cove", "off",
        "--ids", "EQ-001",
        "--preflight-only",
    ])

    assert rc == 0
    assert not results.exists()


def test_preflight_rejects_incomplete_source_manifest(tmp_path):
    source = _make_source_run(tmp_path)
    (source / "manifest.json").write_text(
        json.dumps({"kind": "critic_ablation", "status": "failed"}), encoding="utf-8"
    )

    result = RE.run_repair(
        str(source), ["v3"], None, preflight_only=True, confirm_paid=False,
    )

    assert result["passed"] is False
    assert "source_run_manifest_not_complete" in result["preflight_errors"]


def test_preflight_default_targets_include_unrecoverable_dataset_questions(tmp_path):
    source = _make_source_run(tmp_path, retrieval_has_qid=False)

    result = RE.run_repair(
        str(source), ["v3"], None, preflight_only=True, confirm_paid=False,
    )

    assert result["passed"] is False
    assert result["missing"] == ["EQ-001"]
    assert "unrecoverable_source_records" in result["preflight_errors"]


def test_paid_run_rejects_explicit_missing_id_before_any_llm_call(tmp_path, monkeypatch):
    source = _make_source_run(tmp_path)
    results = tmp_path / "results"
    monkeypatch.setattr(RE, "RESULTS_ROOT", results)
    calls = {"n": 0}

    def post(_body):
        calls["n"] += 1
        raise AssertionError("missing source record must abort before an LLM call")

    result = RE.run_repair(
        str(source), ["v3"], ["EQ-999"], preflight_only=False,
        confirm_paid=True, post_fn=post,
    )

    assert result["passed"] is False
    assert result["missing"] == ["EQ-999"]
    assert calls["n"] == 0
    assert not results.exists()


def test_p5_fails_when_no_patch_is_accepted():
    assert RE.p5_gate(set()) == "FAIL"
    assert RE.p5_gate({"EQ-001"}) == "PASS"


def test_baseline_budget_is_not_recomputed_after_manifest_changes(tmp_path):
    baseline = tmp_path / "baseline"
    baseline.mkdir()
    manifest = baseline / "manifest.json"
    manifest.write_text('{"status":"complete"}', encoding="utf-8")
    _write_jsonl(baseline / "llm_calls.jsonl", [{
        "id": "EQ-001", "usage": {"total_tokens": 100}, "physical_call": True,
    }])
    calls = baseline / "llm_calls.jsonl"
    saved_manifest_hash = RE._file_sha256(manifest)
    saved_calls_hash = RE._file_sha256(calls)
    manifest.write_text('{"status":"complete","changed":true}', encoding="utf-8")

    assert RE.historical_budget_if_intact(
        str(baseline), ["EQ-001"], saved_manifest_hash=saved_manifest_hash,
        saved_calls_hash=saved_calls_hash,
    ) is None


def test_baseline_budget_is_not_recomputed_after_llm_calls_change(tmp_path):
    baseline = tmp_path / "baseline"
    baseline.mkdir()
    manifest = baseline / "manifest.json"
    calls = baseline / "llm_calls.jsonl"
    manifest.write_text('{"status":"complete"}', encoding="utf-8")
    _write_jsonl(calls, [{
        "id": "EQ-001", "usage": {"total_tokens": 100}, "physical_call": True,
    }])
    saved_manifest_hash = RE._file_sha256(manifest)
    saved_calls_hash = RE._file_sha256(calls)
    _write_jsonl(calls, [{
        "id": "EQ-001", "usage": {"total_tokens": 999}, "physical_call": True,
    }])

    assert RE.historical_budget_if_intact(
        str(baseline), ["EQ-001"], saved_manifest_hash=saved_manifest_hash,
        saved_calls_hash=saved_calls_hash,
    ) is None


# Task 1: deterministic internal-ID sanitizer
@pytest.mark.parametrize(
    ("draft", "expected"),
    [
        ("依据 REG-GMP2010-A001 的规定。", "依据 的规定。"),
        ("【教材知识点 KP-BK-001】正文保留。", "【教材知识点】正文保留。"),
        ("【法规依据 REG-GMP2010-A001】正文保留。", "【法规依据】正文保留。"),
        ("前文 KP-BK-001，后文 REG-GMP2010-A001。", "前文，后文。"),
    ],
)
def test_sanitizer_removes_reg_and_kp_ids_without_llm(monkeypatch, draft, expected):
    monkeypatch.setattr(T, "_llm_chat", lambda *args, **kwargs: pytest.fail("sanitizer called LLM"))

    sanitized, edits = T._sanitize_internal_ids(draft)

    assert sanitized == expected
    assert edits


def test_sanitizer_preserves_non_id_regions_byte_for_byte():
    draft = "前段原样\r\n【教材知识点 KP-BK-001】正文  两个空格\n尾段原样"

    sanitized, edits = T._sanitize_internal_ids(draft)

    assert sanitized.startswith("前段原样\r\n")
    assert sanitized.endswith("正文  两个空格\n尾段原样")
    assert _rebuild_from_edits(draft, edits) == sanitized


def test_sanitizer_keeps_surrounding_answer_content():
    draft = "删除前内容 REG-GMP2010-A001 删除后内容"

    sanitized, _ = T._sanitize_internal_ids(draft)

    assert sanitized == "删除前内容 删除后内容"


def test_sanitizer_is_idempotent():
    once, _ = T._sanitize_internal_ids("【教材知识点 KP-BK-001】内容 REG-GMP2010-A002")
    twice, second_edits = T._sanitize_internal_ids(once)

    assert twice == once
    assert second_edits == []


def test_sanitizer_records_reconstructable_spans():
    draft = "A REG-GMP2010-A001 B KP-BK-002 C"

    sanitized, edits = T._sanitize_internal_ids(draft)

    assert _rebuild_from_edits(draft, edits) == sanitized
    for edit in edits:
        assert edit["kind"] == "internal_id_remove"
        assert edit["before_sha256"] == hashlib.sha256(edit["before"].encode("utf-8")).hexdigest()
        assert edit["after_sha256"] == hashlib.sha256(edit["after"].encode("utf-8")).hexdigest()


def test_semantic_critic_runs_after_id_sanitize(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    monkeypatch.setattr(T, "COVE_ENABLED", False)
    seen = []

    def fake_llm(messages, **kwargs):
        seen.append(messages[0]["content"])
        return '{"passed":true,"issues":[]}'

    monkeypatch.setattr(T, "_llm_chat", fake_llm)
    docs = [{
        "id": "REG-GMP2010-A001", "doc_type": "regulation", "title": "一",
        "content": "企业应当建立质量管理体系。", "score": 0.9,
    }]
    evidence = T._prepare_tutor_evidence(docs)
    state = {
        "messages": [type("Message", (), {"content": "问题"})()],
        "evidence": evidence,
        "retrieved_docs": docs,
        "draft_answer": "依据 REG-GMP2010-A001 的规定。",
        "initial_draft": "依据 REG-GMP2010-A001 的规定。",
        "step": 0,
        "timings_ms": T._new_timings(),
        "stage_counts": T._new_stage_counts(),
    }

    result = T.node_critique(state)

    assert len(seen) == 1
    assert "REG-GMP2010-A001" not in seen[0].split("待审答案：", 1)[1]
    assert result["draft_answer"] == "依据 的规定。"
    assert result["sanitizer_edits"]
    assert result["critic_decision"]["passed"] is True
    assert result["termination_reason"] == "passed_after_sanitize"


def _citation_docs():
    return [
        {
            "id": "REG-GMP2010-A001", "doc_type": "regulation", "title": "一",
            "content": "企业应当建立质量管理体系。第二句仅用于压缩前原文尾部。", "score": 0.9,
        },
        {
            "id": "REG-GMP2010-A002", "doc_type": "regulation", "title": "二",
            "content": "人员应当经过培训。", "score": 0.8,
        },
    ]


def _citation(article: str, source: str, quote: str) -> str:
    return f"【条款编号】{article}\n【来源】{source}\n【原文内容】{quote}"


# Task 2: every citation triple must be supported by one provided evidence item
def test_wrong_article_is_rejected():
    evidence = T._prepare_tutor_evidence(_citation_docs())
    draft = _citation("第九条", "《药品生产质量管理规范》(2010年版)", "企业应当建立质量管理体系。")

    issues = T._check_output_contract(draft, evidence)

    assert any(issue["issue_type"] == "unsupported_citation" for issue in issues)


def test_wrong_source_is_rejected():
    evidence = T._prepare_tutor_evidence(_citation_docs())
    draft = _citation("第一条", "GMP附录·原料药", "企业应当建立质量管理体系。")

    issues = T._check_output_contract(draft, evidence)

    assert any(issue["issue_type"] == "source_mismatch" for issue in issues)


def test_quote_from_different_evidence_item_is_rejected():
    evidence = T._prepare_tutor_evidence(_citation_docs())
    draft = _citation("第一条", "《药品生产质量管理规范》(2010年版)", "人员应当经过培训。")

    issues = T._check_output_contract(draft, evidence)

    assert any(issue["issue_type"] == "quote_mismatch" for issue in issues)


def test_quote_only_in_unprovided_tail_is_rejected():
    evidence = T._prepare_tutor_evidence(_citation_docs())
    assert "第二句仅用于压缩前原文尾部。" in evidence["items"][0]["original_content"]
    assert "第二句仅用于压缩前原文尾部。" not in evidence["items"][0]["provided_content"]
    draft = _citation("第一条", "《药品生产质量管理规范》(2010年版)", "第二句仅用于压缩前原文尾部。")

    issues = T._check_output_contract(draft, evidence)

    assert any(issue["issue_type"] == "quote_mismatch" for issue in issues)


def test_article_source_quote_from_same_item_passes():
    evidence = T._prepare_tutor_evidence(_citation_docs())
    draft = _citation("第一条", "《药品生产质量管理规范》(2010年版)", "企业应当建立质量管理体系。")

    assert T._check_output_contract(draft, evidence) == []


@pytest.mark.parametrize("kind", ["source", "quote"])
def test_repairable_deterministic_citation_issue_has_verified_target_and_evidence(monkeypatch, kind):
    evidence = T._prepare_tutor_evidence(_citation_docs())
    if kind == "source":
        draft = _citation("第一条", "错误来源", "企业应当建立质量管理体系。")
        expected_type = "source_mismatch"
    else:
        draft = _citation("第一条", "《药品生产质量管理规范》(2010年版)", "错误原文")
        expected_type = "quote_mismatch"
    monkeypatch.setattr(T, "_llm_chat", lambda *args, **kwargs: '{"passed":true,"issues":[]}')

    decision = T._critique_answer_v2("问题", draft, evidence)
    issue = next(item for item in decision["issues"] if item["issue_type"] == expected_type)

    expected_target = "错误来源" if kind == "source" else "错误原文"
    assert issue["target_text"] == expected_target
    assert issue["evidence_ids"] == ["REG-GMP2010-A001"]
    assert issue["evidence_quote"] in evidence["items"][0]["provided_content"]
    assert issue["auto_repairable"] is True


def test_source_mismatch_patch_only_replaces_source_field(monkeypatch):
    evidence = T._prepare_tutor_evidence(_citation_docs())
    draft = _citation("第一条", "错误来源", "企业应当建立质量管理体系。")
    monkeypatch.setattr(T, "_llm_chat", lambda *args, **kwargs: '{"passed":true,"issues":[]}')
    decision = T._critique_answer_v2("问题", draft, evidence)
    issue = next(item for item in decision["issues"] if item["issue_type"] == "source_mismatch")
    replacement = evidence["items"][0]["display_source"]

    candidate, _ = T._apply_verified_patch(
        draft,
        [{
            "issue_id": issue["issue_id"], "operation": "replace",
            "target_text": issue["target_text"], "replacement_text": replacement,
            "evidence_ids": issue["evidence_ids"],
        }],
        decision["issues"],
        evidence,
    )

    assert "【来源】" + replacement in candidate
    assert "【条款编号】第一条" in candidate
    assert "【原文内容】企业应当建立质量管理体系。" in candidate


def test_single_character_evidence_substring_cannot_replace_fact_claim():
    evidence = T._prepare_tutor_evidence(_citation_docs())
    decision = T._validate_critic_decision(
        _critic_decision(
            target_text="错误声明",
            evidence_quote="企业应当建立质量管理体系。",
            correction="企",
        ),
        "错误声明",
        evidence,
    )

    with pytest.raises(ValueError, match="replacement_not_expected"):
        T._apply_verified_patch(
            "错误声明",
            [_edit(target="错误声明", replacement="企")],
            decision["issues"],
            evidence,
        )


def test_duplicate_deterministic_and_semantic_issue_is_merged(monkeypatch):
    evidence = T._prepare_tutor_evidence(_citation_docs())
    draft = _citation("第一条", "错误来源", "企业应当建立质量管理体系。")
    semantic = {
        "passed": False,
        "issues": [{
            "issue_id": "LLM-1", "issue_type": "source_mismatch", "severity": "high",
            "claim": "来源错误", "target_text": "错误来源",
            "evidence_ids": ["REG-GMP2010-A001"],
            "evidence_quote": "企业应当建立质量管理体系。",
            "correction": "《药品生产质量管理规范》(2010年版)", "confidence": 0.99,
        }],
    }
    monkeypatch.setattr(T, "_llm_chat", lambda *args, **kwargs: json.dumps(semantic, ensure_ascii=False))

    decision = T._critique_answer_v2("问题", draft, evidence)

    matches = [item for item in decision["issues"] if item["issue_type"] == "source_mismatch"]
    assert len(matches) == 1
    assert matches[0]["auto_repairable"] is True


def test_evidence_items_only_include_content_sent_to_model(monkeypatch):
    monkeypatch.setattr(T, "RAG_FINAL_TOP_N", 2)
    docs = _citation_docs() + [{
        "id": "REG-GMP2010-A003", "doc_type": "regulation", "title": "三",
        "content": "未提供的第三条。", "score": 0.1,
    }]

    evidence = T._prepare_tutor_evidence(docs)

    assert len(evidence["items"]) == 2
    assert [item["id"] for item in evidence["items"]] == ["REG-GMP2010-A001", "REG-GMP2010-A003"]
    assert all(item["id"] in evidence["context"] for item in evidence["items"])


def _critic_decision(*, evidence_ids=None, evidence_quote="企业应当建立质量管理体系。",
                     target_text="错误声明", confidence=0.95,
                     issue_type="fact_contradiction", correction="改为正确声明"):
    return {
        "passed": False,
        "issues": [{
            "issue_id": "I1",
            "issue_type": issue_type,
            "severity": "high",
            "claim": "存在错误",
            "target_text": target_text,
            "evidence_ids": evidence_ids if evidence_ids is not None else ["REG-GMP2010-A001"],
            "evidence_quote": evidence_quote,
            "correction": correction,
            "confidence": confidence,
        }],
        "raw_response": "raw-json",
        "context_sha256": "ctx",
        "decision_source": "llm",
    }


# Task 3: Critic decisions must be evidence-validated before repair
def test_unknown_evidence_id_is_not_auto_repairable():
    evidence = T._prepare_tutor_evidence(_citation_docs())

    decision = T._validate_critic_decision(
        _critic_decision(evidence_ids=["REG-GMP2010-A999"]), "错误声明", evidence)

    issue = decision["issues"][0]
    assert issue["auto_repairable"] is False
    assert "unknown_evidence_id" in issue["validation_errors"]


def test_retrieved_but_unprovided_evidence_id_is_not_auto_repairable(monkeypatch):
    monkeypatch.setattr(T, "RAG_FINAL_TOP_N", 1)
    evidence = T._prepare_tutor_evidence(_citation_docs())
    assert "REG-GMP2010-A002" in evidence["retrieved_ids"]
    assert "REG-GMP2010-A002" not in evidence["provided_ids"]

    decision = T._validate_critic_decision(
        _critic_decision(evidence_ids=["REG-GMP2010-A002"], evidence_quote="人员应当经过培训。"),
        "错误声明", evidence)

    assert decision["issues"][0]["auto_repairable"] is False
    assert "unknown_evidence_id" in decision["issues"][0]["validation_errors"]


def test_quote_not_in_claimed_evidence_is_not_auto_repairable():
    evidence = T._prepare_tutor_evidence(_citation_docs())

    decision = T._validate_critic_decision(
        _critic_decision(evidence_quote="证据里不存在的句子"), "错误声明", evidence)

    assert decision["issues"][0]["auto_repairable"] is False
    assert "evidence_quote_mismatch" in decision["issues"][0]["validation_errors"]


def test_non_unique_target_is_not_auto_repairable():
    evidence = T._prepare_tutor_evidence(_citation_docs())

    decision = T._validate_critic_decision(
        _critic_decision(), "错误声明；再次出现错误声明", evidence)

    assert decision["issues"][0]["auto_repairable"] is False
    assert "target_not_unique" in decision["issues"][0]["validation_errors"]


def test_low_confidence_issue_is_not_auto_repairable():
    evidence = T._prepare_tutor_evidence(_citation_docs())

    decision = T._validate_critic_decision(
        _critic_decision(confidence=0.79), "错误声明", evidence)

    assert decision["issues"][0]["auto_repairable"] is False
    assert "confidence_below_threshold" in decision["issues"][0]["validation_errors"]


def test_answer_incomplete_is_observe_only_in_p0():
    evidence = T._prepare_tutor_evidence(_citation_docs())

    decision = T._validate_critic_decision(
        _critic_decision(issue_type="answer_incomplete"), "错误声明", evidence)

    assert decision["issues"][0]["auto_repairable"] is False
    assert "observe_only_issue_type" in decision["issues"][0]["validation_errors"]


def test_fully_grounded_unique_issue_is_auto_repairable():
    evidence = T._prepare_tutor_evidence(_citation_docs())

    decision = T._validate_critic_decision(_critic_decision(), "错误声明", evidence)

    assert decision["issues"][0]["auto_repairable"] is True
    assert decision["issues"][0]["validation_errors"] == []
    assert decision["raw_response"] == "raw-json"


def _validated_issue(issue_id="I1", target_text="企业应建立质量管理体系", evidence_ids=None,
                     severity="high"):
    return {
        "issue_id": issue_id,
        "issue_type": "fact_contradiction",
        "severity": severity,
        "claim": "存在错误",
        "target_text": target_text,
        "evidence_ids": evidence_ids or ["REG-GMP2010-A001"],
        "evidence_quote": "企业应当建立质量管理体系。",
        "correction": "企业应当建立质量管理体系。",
        "confidence": 0.95,
        "auto_repairable": True,
        "validation_errors": [],
    }


def _patch_json(*edits):
    return json.dumps({"edits": list(edits)}, ensure_ascii=False)


def _edit(issue_id="I1", target="企业应建立质量管理体系",
          replacement="企业应当建立质量管理体系。", evidence_ids=None):
    return {
        "issue_id": issue_id,
        "operation": "replace",
        "target_text": target,
        "replacement_text": replacement,
        "evidence_ids": evidence_ids or ["REG-GMP2010-A001"],
    }


def _patch_evidence():
    return T._prepare_tutor_evidence([{
        "id": "REG-GMP2010-A001", "doc_type": "regulation", "title": "一",
        "content": "企业应当建立质量管理体系。", "score": 1.0,
    }])


# Task 4: strict, atomic local-patch revise protocol
def test_revise_accepts_only_patch_json():
    edits = T._parse_revise_patch(_patch_json(_edit()))

    assert edits == [_edit()]
    with pytest.raises(ValueError, match="patch_schema"):
        T._parse_revise_patch('{"answer":"一篇完整答案"}')


def test_patch_target_must_match_validated_issue():
    with pytest.raises(ValueError, match="target_mismatch"):
        T._apply_verified_patch(
            "企业应建立质量管理体系", [_edit(target="另一个目标")],
            [_validated_issue()], _patch_evidence())


def test_patch_target_must_be_unique():
    with pytest.raises(ValueError, match="target_not_unique"):
        T._apply_verified_patch(
            "企业应建立质量管理体系；企业应建立质量管理体系",
            [_edit()], [_validated_issue()], _patch_evidence())


def test_overlapping_edits_are_rejected_atomically():
    target_one = "企业应建立质量"
    target_two = "建立质量管理体系"
    issues = [_validated_issue("I1", target_one), _validated_issue("I2", target_two)]
    edits = [
        _edit("I1", target_one),
        _edit("I2", target_two),
    ]

    with pytest.raises(ValueError, match="overlapping_edits"):
        T._apply_verified_patch("企业应建立质量管理体系", edits, issues, _patch_evidence())


def test_patch_cannot_change_protected_region():
    draft = "前缀保持。企业应建立质量管理体系。后缀保持。"

    candidate, trace = T._apply_verified_patch(
        draft, [_edit()], [_validated_issue()], _patch_evidence())

    assert candidate == "前缀保持。企业应当建立质量管理体系。。后缀保持。"
    assert candidate.startswith("前缀保持。") and candidate.endswith("。后缀保持。")
    assert trace[0]["protected_region_match"] is True
    assert _rebuild_from_edits(draft, trace) == candidate


def test_patch_rejects_internal_id_replacement():
    with pytest.raises(ValueError, match="replacement_internal_id"):
        T._apply_verified_patch(
            "企业应建立质量管理体系", [_edit(replacement="REG-GMP2010-A001")],
            [_validated_issue()], _patch_evidence())


def test_empty_patch_stops_without_recritic(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    calls = []
    monkeypatch.setattr(T, "_llm_chat", lambda *args, **kwargs: calls.append(1) or '{"edits":[]}')
    state = {
        "messages": [type("Message", (), {"content": "问题"})()],
        "evidence": T._prepare_tutor_evidence(_citation_docs()),
        "draft_answer": "错误声明",
        "critic_decision": _critic_decision(),
        "step": 0,
        "timings_ms": T._new_timings(),
        "stage_counts": T._new_stage_counts(),
    }
    state["critic_decision"] = T._validate_critic_decision(
        state["critic_decision"], state["draft_answer"], state["evidence"])

    result = T.node_revise(state)

    assert calls == [1]
    assert result["draft_answer"] == "错误声明"
    assert result["termination_reason"] == "patch_empty"


def test_full_answer_response_is_rejected():
    with pytest.raises(ValueError, match="patch_schema"):
        T._parse_revise_patch("这是模型返回的一篇完整修订答案")


# Task 5: candidate selection and final-output state must agree
def test_canonical_issue_signature_survives_paraphrase():
    first = _critic_decision()
    second = _critic_decision()
    second["issues"][0]["claim"] = "换一种说法描述同一问题"

    assert T._issue_signature(first) == T._issue_signature(second)


def test_candidate_must_resolve_at_least_one_issue():
    parent = _critic_decision()
    same_problem = _critic_decision()

    assessment = T._assess_candidate(
        parent, same_problem, protected_region_match=True,
        deterministic_before=0, deterministic_after=0,
    )

    assert assessment["accepted"] is False
    assert assessment["reason"] == "candidate_rejected_no_resolution"
    assert assessment["resolved_issue_signatures"] == []


def test_candidate_with_new_high_issue_is_rejected():
    parent = _critic_decision()
    new_issue = _critic_decision(target_text="另一个错误")

    assessment = T._assess_candidate(
        parent, new_issue, protected_region_match=True,
        deterministic_before=0, deterministic_after=0,
    )

    assert assessment["accepted"] is False
    assert assessment["reason"] == "candidate_rejected_new_issue"
    assert assessment["new_issue_signatures"]


def test_candidate_that_resolves_issue_without_new_issue_is_accepted():
    parent = _critic_decision()
    passed = {
        "passed": True, "issues": [], "raw_response": "{}",
        "context_sha256": "ctx", "decision_source": "llm",
    }

    assessment = T._assess_candidate(
        parent, passed, protected_region_match=True,
        deterministic_before=0, deterministic_after=0,
    )

    assert assessment["accepted"] is True
    assert assessment["reason"] == "candidate_accepted"


def _candidate_state(parent_decision):
    evidence = T._prepare_tutor_evidence(_citation_docs())
    initial = "错误声明"
    return {
        "messages": [type("Message", (), {"content": "问题"})()],
        "evidence": evidence,
        "retrieved_docs": _citation_docs(),
        "draft_answer": "正确声明",
        "initial_draft": initial,
        "best_draft": initial,
        "best_score": T._score_candidate(initial, evidence, initial),
        "parent_critic_decision": parent_decision,
        "parent_draft_sha256": hashlib.sha256(initial.encode("utf-8")).hexdigest(),
        "parent_deterministic_issue_count": 0,
        "patch_trace": [{"protected_region_match": True}],
        "draft_history": [hashlib.sha256(initial.encode("utf-8")).hexdigest()],
        "issue_signature_history": [T._issue_signature(parent_decision)],
        "step": 1,
        "timings_ms": T._new_timings(),
        "stage_counts": T._new_stage_counts(),
    }


def test_node_accepts_candidate_when_parent_issue_is_resolved(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    monkeypatch.setattr(T, "COVE_ENABLED", False)
    evidence = T._prepare_tutor_evidence(_citation_docs())
    parent = T._validate_critic_decision(_critic_decision(), "错误声明", evidence)
    monkeypatch.setattr(T, "_llm_chat", lambda *args, **kwargs: '{"passed":true,"issues":[]}')

    result = T.node_critique(_candidate_state(parent))

    assert result["candidate_assessment"]["accepted"] is True
    assert result["best_draft"] == "正确声明"
    assert result["last_checked_draft_sha256"] == hashlib.sha256("正确声明".encode("utf-8")).hexdigest()


def test_node_rejects_candidate_with_new_high_issue(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    monkeypatch.setattr(T, "COVE_ENABLED", False)
    evidence = T._prepare_tutor_evidence(_citation_docs())
    parent = T._validate_critic_decision(_critic_decision(), "错误声明", evidence)
    response = json.dumps(_critic_decision(target_text="正确声明"), ensure_ascii=False)
    monkeypatch.setattr(T, "_llm_chat", lambda *args, **kwargs: response)

    result = T.node_critique(_candidate_state(parent))

    assert result["candidate_assessment"]["accepted"] is False
    assert result["termination_reason"] == "candidate_rejected_new_issue"
    assert result["best_draft"] == "错误声明"


def test_passed_refers_to_actual_output_sha(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    draft = "已验证输出"
    state = {
        "evidence": T._prepare_tutor_evidence(_citation_docs()),
        "draft_answer": draft,
        "best_draft": draft,
        "critic_decision": {"passed": True, "issues": []},
        "last_checked_draft_sha256": hashlib.sha256(draft.encode("utf-8")).hexdigest(),
    }

    result = T.node_respond(state)

    assert result["termination_reason"] == "passed"
    assert result["output_verified"] is True
    assert result["output_draft_sha256"] == hashlib.sha256(draft.encode("utf-8")).hexdigest()
    assert result["output_draft_sha256"] == result["last_checked_draft_sha256"]


def test_fallback_output_is_not_marked_passed(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    state = {
        "evidence": T._prepare_tutor_evidence(_citation_docs()),
        "draft_answer": "临时通过稿",
        "best_draft": "回退初稿",
        "critic_decision": {"passed": True, "issues": []},
        "termination_reason": "candidate_rejected_new_issue",
        "last_checked_draft_sha256": hashlib.sha256("临时通过稿".encode("utf-8")).hexdigest(),
    }

    result = T.node_respond(state)

    assert result["final_answer"].startswith("回退初稿")
    assert result["final_answer"].endswith(T._DEGRADE_NOTICE)
    assert result["termination_reason"] != "passed"
    assert result["output_verified"] is False


def test_degrade_notice_is_appended_to_unverified_v3_answer(monkeypatch):
    monkeypatch.setattr(T, "TUTOR_REPAIR_V2_ENABLED", True)
    state = {
        "evidence": T._prepare_tutor_evidence(_citation_docs()),
        "draft_answer": "原答案",
        "best_draft": "原答案",
        "critic_decision": _critic_decision(confidence=0.1),
    }

    result = T.node_respond(state)

    assert result["final_answer"].startswith("原答案")
    assert result["final_answer"].endswith(T._DEGRADE_NOTICE)
    assert result["repair_warning"]


_REQUIRED_V3_ARTIFACTS = {
    "manifest.json", "source_run.json", "dataset_snapshot.jsonl",
    "evidence_snapshot.jsonl", "arm_results.jsonl", "critic_trace.jsonl",
    "candidate_trace.jsonl", "llm_calls.jsonl", "deterministic_metrics.jsonl",
    "human_review.csv", "summary.json", "REPORT.md",
}


def _passing_post(body):
    prompt = body["messages"][0]["content"]
    content = "VERIFIED" if "验证专家" in prompt else '{"passed":true,"issues":[]}'
    return {
        "choices": [{"message": {"content": content}}],
        "model": body["model"],
        "usage": {"prompt_tokens": 10, "completion_tokens": 2, "total_tokens": 12},
    }


# Task 6: the harness must persist enough evidence to audit and rebuild a run
def test_v3_run_writes_complete_auditable_artifacts(tmp_path, monkeypatch):
    source = _make_source_run(tmp_path)
    results = tmp_path / "results"
    monkeypatch.setattr(RE, "RESULTS_ROOT", results)

    run = RE.run_repair(
        str(source), ["v3"], ["EQ-001"], preflight_only=False,
        confirm_paid=True, post_fn=_passing_post, implementation="v3", cove_enabled=False,
    )
    result_dir = Path(run["results_dir"])

    assert _REQUIRED_V3_ARTIFACTS <= {path.name for path in result_dir.iterdir()}
    manifest = json.loads((result_dir / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["status"] == "complete"
    assert manifest["implementation_version"] == "v3"
    assert manifest["dataset_sha256"]
    for key in (
        "knowledge_base_fingerprint", "model_route_by_stage", "resolved_model_by_stage",
        "temperature_by_stage", "max_tokens_by_stage", "thinking_by_stage",
        "python_version", "package_lock_sha256", "pricing_snapshot",
        "pricing_source", "pricing_checked_at",
    ):
        assert key in manifest
    assert manifest["pricing_snapshot"]["currency"] == "CNY"
    call = json.loads((result_dir / "llm_calls.jsonl").read_text(encoding="utf-8"))
    assert call["messages"] and call["raw_response"]
    assert call["usage"]["total_tokens"] == 12
    assert call["context_sha256"]
    assert call["effective_context_sha256"]
    assert call["draft_sha256"]
    assert call["started_at"]
    assert call["prompt_tokens"] == 10
    assert call["completion_tokens"] == 2
    assert call["total_tokens"] == 12
    assert call["parse_status"] == "validated_pass"
    assert call["physical_call"] is True
    critic = json.loads((result_dir / "critic_trace.jsonl").read_text(encoding="utf-8"))
    assert critic["raw_response"] == '{"passed":true,"issues":[]}'
    assert critic["validated_issues"] == []
    candidate = json.loads((result_dir / "candidate_trace.jsonl").read_text(encoding="utf-8"))
    assert hashlib.sha256(candidate["draft"].encode("utf-8")).hexdigest() == candidate["draft_sha256"]
    assert candidate["sanitizer_edits"] == []
    summary = json.loads((result_dir / "summary.json").read_text(encoding="utf-8"))
    assert summary["cost"]["physical_calls"] == 1
    assert summary["cost"]["logical_calls"] == 1
    assert summary["cost"]["estimated_cost_cny"] > 0
    report = (result_dir / "REPORT.md").read_text(encoding="utf-8")
    for section in range(1, 15):
        assert f"## {section}." in report
    assert "P10" in report and "PENDING" in report


def test_failed_run_flushes_partial_artifacts_and_marks_manifest_failed(tmp_path, monkeypatch):
    source = _make_source_run(tmp_path)
    results = tmp_path / "results"
    monkeypatch.setattr(RE, "RESULTS_ROOT", results)

    run = RE.run_repair(
        str(source), ["v3"], ["EQ-001"], preflight_only=False,
        confirm_paid=True, post_fn=lambda body: (_ for _ in ()).throw(RuntimeError("boom")),
        implementation="v3", cove_enabled=False,
    )
    result_dir = Path(run["results_dir"])
    manifest = json.loads((result_dir / "manifest.json").read_text(encoding="utf-8"))

    assert run["passed"] is False
    assert manifest["status"] == "failed"
    assert manifest["errors"]
    assert (result_dir / "arm_results.jsonl").exists()
    assert (result_dir / "llm_calls.jsonl").exists()


def test_revise_rejection_is_persisted_in_candidate_trace(tmp_path, monkeypatch):
    source = _make_source_run(tmp_path)
    results = tmp_path / "results"
    monkeypatch.setattr(RE, "RESULTS_ROOT", results)

    def post(body):
        prompt = body["messages"][0]["content"]
        if "局部修订助手" in prompt:
            content = "这是一篇完整答案，不是 patch JSON"
        else:
            content = json.dumps({
                "passed": False,
                "issues": [{
                    "issue_id": "I1", "issue_type": "fact_contradiction",
                    "severity": "high", "claim": "声明错误",
                    "target_text": "企业应当建立质量管理体系。",
                    "evidence_ids": ["REG-GMP2010-A001"],
                    "evidence_quote": "企业应当建立质量管理体系。",
                    "correction": "按证据修正", "confidence": 0.99,
                }],
            }, ensure_ascii=False)
        return {
            "choices": [{"message": {"content": content}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 2, "total_tokens": 12},
        }

    run = RE.run_repair(
        str(source), ["v3"], ["EQ-001"], preflight_only=False,
        confirm_paid=True, post_fn=post, implementation="v3", cove_enabled=False,
    )
    rows = [json.loads(line) for line in
            (Path(run["results_dir"]) / "candidate_trace.jsonl").read_text(encoding="utf-8").splitlines()]

    assert rows[-1]["event_type"] == "revise_termination"
    assert rows[-1]["termination_reason"] == "patch_parse_error"
    assert rows[-1]["patch_raw_response"] == "这是一篇完整答案，不是 patch JSON"
    assert rows[-1]["patch_error"]


def test_cove_increment_requires_plain_miss():
    summary = FI.summarize_increment([
        {"human_verified": True, "plain_critic_caught": True,
         "cove_caught_after_plain_miss": True},
        {"human_verified": True, "plain_critic_caught": False,
         "cove_caught_after_plain_miss": True},
    ])

    assert summary["increment_denominator"] == 1
    assert summary["cove_increment_true_positives"] == 1


def test_unverified_fault_case_is_excluded():
    summary = FI.summarize_increment([
        {"human_verified": False, "plain_critic_caught": False,
         "cove_caught_after_plain_miss": True},
    ])

    assert summary["verified_cases"] == 0
    assert summary["increment_denominator"] == 0
    assert summary["increment_rate"] is None
