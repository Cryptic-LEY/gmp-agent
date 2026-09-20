# -*- coding: utf-8 -*-
"""独立的 Critic/Revise 修复评测入口（05-critic-revise-hardening §11）。

消费已完成运行（source-run）的原始产物，默认不重新检索、不重新 Generate：
复用同一初稿 + 同一 Generate 证据上下文，对 legacy / v2 两种后处理做配对对比。
绝不修改 source-run 目录。付费闸门：--confirm-paid（14 题定向复测 / 全量）。

命令（解释器用项目 .venv）：
  python -m eval.critic_repair_eval --source-run <dir> --mode v2 --ids EQ-001,... --preflight-only
  python -m eval.critic_repair_eval --source-run <dir> --mode paired --repair-modes legacy,v2 --ids ... --confirm-paid
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from langchain_core.messages import HumanMessage

import agents.tutor as T
from eval import critic_metrics as M
from eval.critic_ablation import (
    GMP_API_DIR, _load_jsonl, write_json, write_jsonl, utc_stamp,
    build_git_snapshot, build_config_snapshot,
    build_coverage_prompt, parse_coverage, build_faithfulness_prompt,
    parse_faithfulness, _judge_call,
)

_DEFAULT_RESULTS_ROOT = GMP_API_DIR / "eval" / "results" / "critic_repair"
_V3_RESULTS_ROOT = GMP_API_DIR / "eval" / "results" / "critic_repair_v3"
RESULTS_ROOT = _DEFAULT_RESULTS_ROOT
_REQUIRED_RUN_ARTIFACTS = (
    "source_run.json", "dataset_snapshot.jsonl", "evidence_snapshot.jsonl",
    "arm_results.jsonl", "critic_trace.jsonl", "candidate_trace.jsonl",
    "llm_calls.jsonl", "deterministic_metrics.jsonl", "human_review.csv",
    "summary.json", "REPORT.md",
)
_PRICING_SOURCE = "https://help.aliyun.com/en/model-studio/model-pricing"
_PRICING_CHECKED_AT = "2026-09-04"
_PRICING_SNAPSHOT = {
    "model": "qwen3-max-2026-01-23",
    "deployment": "China (Beijing), default DashScope endpoint",
    "mode": "non-thinking",
    "tier": "0 < input tokens per request <= 32K",
    "currency": "CNY",
    "unit": "per_1m_tokens",
    "input_price": 2.5,
    "output_price": 10.0,
}


class WithinArmDuplicateError(RuntimeError):
    """同一组内出现完全相同的 LLM 请求（应被停滞护栏在发出前拦下）→ 契约失败（§11.3）。"""


def _file_sha256(path: Path) -> str | None:
    return M.sha256_bytes(path.read_bytes()) if path.is_file() else None


def _estimated_cost_cny(prompt_tokens: int, completion_tokens: int) -> float:
    return round(
        prompt_tokens * _PRICING_SNAPSHOT["input_price"] / 1_000_000
        + completion_tokens * _PRICING_SNAPSHOT["output_price"] / 1_000_000,
        6,
    )


def _historical_budget(baseline_dir: Path, ids: list[str]) -> dict:
    calls_path = baseline_dir / "llm_calls.jsonl"
    calls = _load_jsonl(calls_path) if calls_path.is_file() else []
    selected = [call for call in calls
                if call.get("qid") in set(ids) and call.get("arm") == "v2"]
    physical = [call for call in selected if call.get("execution_mode") == "live"]

    def token_sum(name: str) -> int:
        return sum(int((call.get("usage") or {}).get(name, 0) or 0) for call in physical)

    max_revisions = int(T.TUTOR_REPAIR_MAX_REVISIONS)
    worst_calls = len(ids) * (1 + 2 * max_revisions)
    observed_max_tokens = max(
        (int((call.get("usage") or {}).get("total_tokens", 0) or 0) for call in physical),
        default=0,
    )
    prompt_tokens = token_sum("prompt_tokens")
    completion_tokens = token_sum("completion_tokens")
    return {
        "historical_scope": "same_qids_v2_physical_calls",
        "historical_logical_calls": len(selected),
        "historical_physical_calls": len(physical),
        "historical_prompt_tokens": prompt_tokens,
        "historical_completion_tokens": completion_tokens,
        "historical_total_tokens": token_sum("total_tokens"),
        "worst_case_formula": "questions * (initial_critic + max_revisions * (revise + recritic))",
        "worst_case_physical_calls": worst_calls,
        "worst_case_total_tokens": worst_calls * observed_max_tokens,
        "estimated_cost_cny": _estimated_cost_cny(prompt_tokens, completion_tokens),
        # Conservative ceiling: treat every worst-case token as an output token at the dearer rate.
        "worst_case_cost_upper_bound_cny": round(
            worst_calls * observed_max_tokens * _PRICING_SNAPSHOT["output_price"] / 1_000_000, 6
        ),
        "pricing_snapshot": dict(_PRICING_SNAPSHOT),
        "pricing_source": _PRICING_SOURCE,
        "pricing_checked_at": _PRICING_CHECKED_AT,
        "cost_note": "Worst-case cost is a conservative all-output-token upper bound.",
    }


def historical_budget_if_intact(baseline_dir: str, ids: list[str], *,
                                saved_manifest_hash: str | None,
                                saved_calls_hash: str | None) -> dict | None:
    """Read baseline budget only when its manifest and call log match saved bytes."""
    baseline = Path(baseline_dir)
    current_manifest_hash = _file_sha256(baseline / "manifest.json")
    current_calls_hash = _file_sha256(baseline / "llm_calls.jsonl")
    if (not saved_manifest_hash or current_manifest_hash != saved_manifest_hash
            or not saved_calls_hash or current_calls_hash != saved_calls_hash):
        return None
    return _historical_budget(baseline, ids)


def p5_gate(accepted_patch_ids: set[str]) -> str:
    """P5 requires at least one actually accepted repair patch."""
    return "PASS" if accepted_patch_ids else "FAIL"


def build_preflight_snapshot(source_run: str, baseline_run: str,
                             ids: list[str], *, implementation: str = "v3",
                             cove_enabled: bool = False) -> dict:
    """Build an offline, secret-free reproducibility and budget snapshot."""
    source = Path(source_run).resolve()
    baseline = Path(baseline_run).resolve()
    dataset_path = source / "dataset_snapshot.jsonl"
    dataset_rows = _load_jsonl(dataset_path)
    return {
        "implementation_version": implementation,
        "source_run_path": str(source),
        "baseline_run_path": str(baseline),
        "source_run_manifest_sha256": _file_sha256(source / "manifest.json"),
        "baseline_run_manifest_sha256": _file_sha256(baseline / "manifest.json"),
        "baseline_run_llm_calls_sha256": _file_sha256(baseline / "llm_calls.jsonl"),
        "dataset_path": str(dataset_path),
        "dataset_sha256": _file_sha256(dataset_path),
        "dataset_count": len(dataset_rows),
        "evidence_snapshot_sha256": _file_sha256(source / "retrieval_snapshot.jsonl"),
        "git": build_git_snapshot(),
        "config": build_config_snapshot(),
        "target_ids": list(ids),
        "cove_enabled": bool(cove_enabled),
        "repair_max_revisions": int(T.TUTOR_REPAIR_MAX_REVISIONS),
        "min_confidence": float(T.TUTOR_REPAIR_MIN_CONFIDENCE),
        "budget": _historical_budget(baseline, ids),
    }


# ── §11.5 从 source-run 恢复初稿与证据（不重新 Generate）───────────────────────
def _retrieval_by_qid(source_dir: Path, gen_order: list[str]) -> dict[str, list[dict]]:
    rows = _load_jsonl(source_dir / "retrieval_snapshot.jsonl")
    by: dict[str, list[dict]] = {}
    for r in rows:
        qid = r.get("qid")
        if not isinstance(qid, str) or not qid:
            # V3 evidence recovery is identity-based. Old positional snapshots
            # are deliberately unrecoverable because row order is not evidence.
            return {}
        by.setdefault(qid, []).append(r)
    return by


_PROMPT_EVIDENCE_ID_RE = re.compile(
    r"^【(?:法规条文|参考文档).*?\|\s*((?:REG|KP)-[A-Z0-9][A-Z0-9\-]*)】"
    r"|^【教材知识点\s+((?:REG|KP)-[A-Z0-9][A-Z0-9\-]*)】",
    re.MULTILINE,
)


def _extract_prompt_evidence(call: dict, question: str) -> tuple[str, list[str]] | None:
    """Recover the exact context and ordered IDs from a Generate request."""
    for message in call.get("messages") or []:
        if not isinstance(message, dict):
            continue
        content = str(message.get("content", ""))
        marker = "参考资料：\n"
        question_marker = "\n\n学生问题："
        if marker not in content or question_marker not in content:
            continue
        context, prompt_question = content.split(marker, 1)[1].rsplit(question_marker, 1)
        if prompt_question.strip() != (question or "").strip():
            return None
        ids = [left or right for left, right in _PROMPT_EVIDENCE_ID_RE.findall(context)]
        if not ids or len(ids) != len(set(ids)):
            return None
        return context, ids
    return None


def _recover_evidence_from_call(call: dict, question: str, generation: dict,
                                retrieval_rows: list[dict]) -> tuple[dict, list[dict]] | None:
    parsed = _extract_prompt_evidence(call, question)
    if parsed is None:
        return None
    context, ordered_ids = parsed
    provided_contexts = generation.get("gen_contexts") or []
    if len(ordered_ids) != len(provided_contexts):
        return None

    serial: list[dict] = []
    items: list[dict] = []
    for evidence_id, provided_content in zip(ordered_ids, provided_contexts):
        candidates = []
        for row in retrieval_rows:
            if row.get("id") != evidence_id:
                continue
            compressed = T.compress_chunk(str(row.get("content", "")), T.CTX_COMPRESS_RATIO)
            if compressed == provided_content:
                candidates.append(row)
        # The same document may occur in several qids. That is still unique if
        # all identity-bearing fields agree; score/rank are run-local metadata.
        identities = {
            (str(row.get("id", "")), str(row.get("doc_type", "")),
             str(row.get("title", "")), str(row.get("content", "")))
            for row in candidates
        }
        if len(identities) != 1:
            return None
        row = candidates[0]
        serial_row = {
            "id": evidence_id,
            "doc_type": row.get("doc_type", ""),
            "title": row.get("title", ""),
            "content": row.get("content", ""),
            "score": row.get("score", 0.0),
        }
        serial.append(serial_row)
        display_article = ""
        display_source = ""
        is_citable = False
        if serial_row["doc_type"] == "regulation":
            display_source, is_citable = T._source_label(evidence_id)
            if is_citable:
                display_article = T._article_display_num(serial_row["title"], evidence_id)
        provided_sha = T._sha256_text(provided_content)
        original_sha = T._sha256_text(serial_row["content"])
        items.append({
            **serial_row,
            "display_article": display_article,
            "display_source": display_source,
            "is_citable": is_citable,
            "provided_content": provided_content,
            "original_content": serial_row["content"],
            "provided_content_sha256": provided_sha,
            "original_content_sha256": original_sha,
            "provided_sha256": provided_sha,
            "original_sha256": original_sha,
        })
    evidence = {
        "context": context,
        "context_sha256": T._sha256_text(context),
        "retrieved_ids": ordered_ids,
        "provided_ids": ordered_ids,
        "items": items,
    }
    return evidence, serial


def recover_source(source_run: str) -> dict:
    """返回 {"records": {qid: {...}}, "unrecoverable": [qid,...]}。
    每条含 question / initial_draft / evidence / answer_points / gold_reg / gold_kp。
    通过重建证据的 provided_content 与 generation.gen_contexts 逐条比对来校验唯一恢复。"""
    d = Path(source_run)
    dataset = {r["id"]: r for r in _load_jsonl(d / "dataset_snapshot.jsonl")}
    gen = {g["id"]: g for g in _load_jsonl(d / "generation.jsonl")}
    gen_order = [g["id"] for g in _load_jsonl(d / "generation.jsonl")]
    retrieval_rows = _load_jsonl(d / "retrieval_snapshot.jsonl")
    retrieval_by_qid = _retrieval_by_qid(d, gen_order)
    call_rows = _load_jsonl(d / "llm_calls.jsonl")
    calls_by_id: dict[str, list[dict]] = {}
    for call in call_rows:
        calls_by_id.setdefault(str(call.get("call_id", "")), []).append(call)

    records, unrecoverable, recovery_errors = {}, [], {}
    for qid, g in gen.items():
        errors: list[str] = []
        generate_call_ids = g.get("generate_call_ids") or []
        if (not isinstance(generate_call_ids, list) or len(generate_call_ids) != 1
                or not isinstance(generate_call_ids[0], str)):
            errors.append("ambiguous_generate_call_ids")
            generate_call = None
        else:
            matches = calls_by_id.get(generate_call_ids[0], [])
            if len(matches) != 1:
                errors.append("generate_call_id_not_unique")
                generate_call = None
            else:
                generate_call = matches[0]
                if generate_call.get("call_type") != "generate":
                    errors.append("generate_call_has_wrong_type")
                raw = generate_call.get("raw_response") or {}
                try:
                    response_draft = raw["choices"][0]["message"]["content"]
                except (KeyError, IndexError, TypeError):
                    response_draft = None
                if response_draft != g.get("draft"):
                    errors.append("generate_response_draft_mismatch")

        ev_and_serial = (_recover_evidence_from_call(
            generate_call, str(dataset.get(qid, {}).get("question", "")), g,
            retrieval_by_qid.get(qid, []))
            if generate_call is not None else None)
        if ev_and_serial is None:
            errors.append("generate_prompt_evidence_not_unique")
            ev, serial = None, []
        else:
            ev, serial = ev_and_serial

        if T._draft_sha256(g.get("draft", "")) != g.get("draft_sha256"):
            errors.append("generation_draft_sha_mismatch")
        if errors:
            unrecoverable.append(qid)
            recovery_errors[qid] = errors
            continue
        rec = dataset.get(qid, {})
        records[qid] = {
            "question": rec.get("question", ""),
            "initial_draft": g["draft"],
            "evidence": ev, "serial_docs": serial,
            "answer_points": rec.get("answer_points", []),
            "gold_reg": rec.get("expect_reg_ids", []),
            "gold_kp": rec.get("expect_kp_ids", []),
            "generate_call_id": generate_call_ids[0],
            "generate_request_sha256": generate_call.get("request_sha256") if generate_call else None,
        }
    return {"records": records, "unrecoverable": unrecoverable,
            "recovery_errors": recovery_errors}


# ── §11.3 组感知可观测客户端：跨组 replay 标注；组内重复=契约失败 ──────────────
class RepairClient:
    def __init__(self, post_fn=None):
        self._post = post_fn or self._real_post
        self.calls: list[dict] = []
        self._global: dict[str, dict] = {}          # sha -> first call (跨组 replay 源)
        self._seen_in_arm: set[tuple] = set()        # (arm, sha) 组内去重
        self.current_arm: str | None = None
        self.current_qid: str | None = None
        self.current_round: int | None = None
        self.current_context_sha256: str | None = None
        self.current_draft_sha256: str | None = None

    def _real_post(self, body: dict) -> dict:
        import httpx
        from config import LLM_BASE_URL, LLM_API_KEY
        resp = httpx.post(f"{LLM_BASE_URL}/chat/completions",
                          headers={"Authorization": f"Bearer {LLM_API_KEY}"},
                          json=body, timeout=120)
        resp.raise_for_status()
        return resp.json()

    def __call__(self, messages, temperature: float = 0.3, model=None) -> str:
        from config import LLM_MODEL, LLM_ENABLE_THINKING
        body = {"model": model or LLM_MODEL, "messages": messages, "temperature": temperature}
        if LLM_ENABLE_THINKING:
            body["enable_thinking"] = True
        sha = M.sha256_text(json.dumps(body, ensure_ascii=False, sort_keys=True))
        started_at = datetime.now(timezone.utc).isoformat()
        key = (self.current_qid, self.current_arm, sha)
        call_id = f"call_{len(self.calls) + 1:04d}"
        prompt_text = "\n".join(str(message.get("content", "")) for message in messages)
        if "局部修订助手" in prompt_text:
            stage = "revise"
        elif "法规验证专家" in prompt_text:
            stage = "critic_cove"
        elif "法规审核专家" in prompt_text:
            stage = "critic_standard"
        else:
            stage = "unknown"
        effective_context_sha256 = self.current_context_sha256
        effective_draft_sha256 = self.current_draft_sha256
        if stage == "critic_cove":
            match = re.search(
                r"参考资料：\n(?P<context>.*?)\n\n待验证回答：\n(?P<draft>.*?)\n\n请检查",
                prompt_text, re.S,
            )
            if match:
                effective_context_sha256 = M.sha256_text(match.group("context"))
                effective_draft_sha256 = M.sha256_text(match.group("draft"))

        def record(*, execution_mode: str, replay_of=None, replay_reason=None,
                   usage=None, latency_ms=None, raw_response=None, error=None,
                   physical_call: bool) -> None:
            usage = usage or {}
            self.calls.append({
                "call_id": call_id,
                "qid": self.current_qid,
                "arm": self.current_arm,
                "round": self.current_round,
                "stage": stage,
                "request_sha256": sha,
                "messages": messages,
                "context_sha256": self.current_context_sha256,
                "effective_context_sha256": effective_context_sha256,
                "draft_sha256": self.current_draft_sha256,
                "effective_draft_sha256": effective_draft_sha256,
                "started_at": started_at,
                "model": body["model"],
                "temperature": temperature,
                "max_tokens": body.get("max_tokens"),
                "thinking": body.get("enable_thinking", False),
                "execution_mode": execution_mode,
                "physical_call": physical_call,
                "replay": execution_mode == "replay",
                "replay_source_call_id": replay_of,
                "replay_of": replay_of,
                "replay_reason": replay_reason,
                "usage": usage or None,
                "prompt_tokens": usage.get("prompt_tokens"),
                "completion_tokens": usage.get("completion_tokens"),
                "total_tokens": usage.get("total_tokens"),
                "latency_ms": latency_ms,
                "raw_response": raw_response,
                "parse_status": "call_error" if error else None,
                "error": error,
            })
        if key in self._seen_in_arm:
            # v2 有停滞护栏，本应在发请求前拦下组内重复 → 契约失败（§11.3）。
            if self.current_arm in {"v2", "v3"}:
                raise WithinArmDuplicateError(
                    f"组内重复请求 qid={self.current_qid} arm={self.current_arm}")
            # legacy 无停滞护栏，重复请求是其固有的退化循环行为 → replay 复现（不崩、可核算）。
            prev = self._global[sha]
            record(execution_mode="replay", replay_of=prev["call_id"],
                   replay_reason="within_arm_legacy_loop", usage=prev.get("usage"),
                   latency_ms=prev.get("latency_ms"), raw_response=prev.get("raw_response"),
                   physical_call=False)
            return prev["content"]
        self._seen_in_arm.add(key)
        if sha in self._global:                      # 跨组相同请求 → replay 标注
            prev = self._global[sha]
            content, mode, replay_of, reason = prev["content"], "replay", prev["call_id"], "cross_arm_pairing"
            raw, latency, usage = prev.get("raw_response"), prev.get("latency_ms"), prev.get("usage")
        else:
            t0 = time.monotonic()
            try:
                resp = self._post(body)
            except Exception as exc:
                latency = max(0, int((time.monotonic() - t0) * 1000))
                record(execution_mode="error", usage=None, latency_ms=latency,
                       raw_response=None, error=repr(exc), physical_call=True)
                raise
            latency = max(0, int((time.monotonic() - t0) * 1000))
            content = resp["choices"][0]["message"]["content"]
            mode, replay_of, reason, raw, usage = "live", None, None, resp, resp.get("usage")
            self._global[sha] = {"content": content, "call_id": call_id,
                                 "usage": usage, "latency_ms": latency,
                                 "raw_response": raw}
        record(execution_mode=mode, replay_of=replay_of, replay_reason=reason,
               usage=usage, latency_ms=latency, raw_response=raw,
               physical_call=mode == "live")
        return content


# ── 单题单模式修复（驱动同一批节点；v2 走护栏循环，legacy 走旧循环）────────────
def run_one_repair(qid: str, rec: dict, mode: str,
                   client: RepairClient) -> tuple[dict, list[dict], list[dict]]:
    client.current_qid, client.current_arm = qid, mode
    prev_flag = T.TUTOR_REPAIR_V2_ENABLED
    structured = mode in {"v2", "v3"}
    T.TUTOR_REPAIR_V2_ENABLED = structured
    trace: list[dict] = []
    critic_trace: list[dict] = []

    def mark_latest_call(stage: str, status: str) -> None:
        for call in reversed(client.calls):
            if (call.get("qid") == qid and call.get("arm") == mode
                    and call.get("round") == client.current_round
                    and call.get("stage") == stage and call.get("parse_status") is None):
                call["parse_status"] = status
                return
    try:
        state = {
            "messages": [HumanMessage(content=rec["question"])],
            "evidence": rec["evidence"], "retrieved_docs": rec["serial_docs"],
            "draft_answer": rec["initial_draft"], "initial_draft": rec["initial_draft"],
            "step": 0, "timings_ms": T._new_timings(), "stage_counts": T._new_stage_counts(),
        }
        rnd = 0
        while True:
            client.current_round = rnd
            client.current_context_sha256 = rec["evidence"]["context_sha256"]
            client.current_draft_sha256 = T._draft_sha256(state["draft_answer"])
            sanitizer_count_before = len(state.get("sanitizer_edits") or [])
            state.update(T.node_critique(state))
            new_sanitizer_edits = (state.get("sanitizer_edits") or [])[sanitizer_count_before:]
            cur = state["draft_answer"]
            score = T._score_candidate(cur, rec["evidence"], rec["initial_draft"]) if structured else None
            decision = state.get("critic_decision") or {"passed": not state.get("critic_issues"), "issues": []}
            if structured:
                decision_source = str(decision.get("decision_source", ""))
                if "parse_error" in decision_source:
                    mark_latest_call("critic_standard", "parse_error")
                elif decision.get("passed"):
                    mark_latest_call("critic_standard", "validated_pass")
                else:
                    mark_latest_call("critic_standard", "validated_issues")
                if decision.get("cove_trace"):
                    mark_latest_call(
                        "critic_cove", str(decision["cove_trace"].get("parsed_decision", "parsed"))
                    )
            deterministic_issues = T._check_output_contract(cur, rec["evidence"]) if structured else []
            critic_trace.append({
                "qid": qid, "arm": mode, "round": rnd,
                "draft_sha256": T._draft_sha256(cur),
                "context_sha256": rec["evidence"]["context_sha256"],
                "deterministic_issues": deterministic_issues,
                "raw_response": decision.get("raw_response", ""),
                "parsed_decision": decision,
                "validated_issues": decision.get("issues", []),
                "rejected_issues": [issue for issue in decision.get("issues", [])
                                    if not issue.get("auto_repairable", False)],
                "auto_repairable_issues": T._auto_repairable_issues(decision) if structured else [],
                "decision_source": decision.get("decision_source"),
                "cove_trace": decision.get("cove_trace"),
            })
            trace.append({
                "id": qid, "mode": mode, "round": rnd,
                "event_type": "critic_result",
                "draft": cur,
                "draft_sha256": T._draft_sha256(cur),
                "parent_draft_sha256": state.get("parent_draft_sha256"),
                "context_sha256": rec["evidence"]["context_sha256"],
                "issue_signature": (T._issue_signature(state.get("critic_decision") or {"passed": True})
                                    if structured else None),
                "candidate_score": list(score) if score else None,
                "selected_as_best": (structured and T._draft_sha256(state.get("best_draft", "")) == T._draft_sha256(cur)),
                "patch_raw_response": state.get("raw_revise_response"),
                "patch_trace": state.get("patch_trace") or [],
                "sanitizer_edits": new_sanitizer_edits,
                "candidate_assessment": state.get("candidate_assessment"),
                "termination_reason": state.get("termination_reason"),
            })
            if T._should_revise(state) == "respond":
                state.update(T.node_respond(state))
                break
            revise_parent_draft = state["draft_answer"]
            revise_parent_decision = state.get("critic_decision") or {"passed": True, "issues": []}
            client.current_draft_sha256 = T._draft_sha256(state["draft_answer"])
            state.update(T.node_revise(state))
            revise_status = {
                "patch_parse_error": "parse_error",
                "patch_empty": "parsed_empty",
                "patch_rejected_target": "parsed_rejected_target",
                "patch_rejected_protected_region": "parsed_rejected_protected_region",
            }.get(state.get("termination_reason"), "parsed_applied")
            mark_latest_call("revise", revise_status)
            rnd += 1
            if state.get("termination_reason"):
                stopped_draft = state["draft_answer"]
                stopped_score = (T._score_candidate(
                    stopped_draft, rec["evidence"], rec["initial_draft"]
                ) if structured else None)
                trace.append({
                    "id": qid, "mode": mode, "round": rnd,
                    "event_type": "revise_termination",
                    "draft": stopped_draft,
                    "draft_sha256": T._draft_sha256(stopped_draft),
                    "parent_draft_sha256": T._draft_sha256(revise_parent_draft),
                    "context_sha256": rec["evidence"]["context_sha256"],
                    "issue_signature": (T._issue_signature(revise_parent_decision)
                                        if structured else None),
                    "candidate_score": list(stopped_score) if stopped_score else None,
                    "selected_as_best": (
                        structured
                        and T._draft_sha256(state.get("best_draft", "")) == T._draft_sha256(stopped_draft)
                    ),
                    "patch_raw_response": state.get("raw_revise_response"),
                    "patch_trace": state.get("patch_trace") or [],
                    "patch_error": state.get("patch_error"),
                    "sanitizer_edits": [],
                    "candidate_assessment": state.get("candidate_assessment"),
                    "termination_reason": state.get("termination_reason"),
                    "avoided_recritic": True,
                })
                state.update(T.node_respond(state))
                break
        final = state.get("final_answer", state["draft_answer"])
        arm_res = {"id": qid, "mode": mode, "final_answer": final,
                   "final_sha256": T._draft_sha256(final),
                   "initial_draft_sha256": T._draft_sha256(rec["initial_draft"]),
                   "revisions": state.get("step", 0),
                   "termination_reason": state.get("termination_reason") if structured
                   else ("passed" if not state.get("critic_issues") else "v1_degraded"),
                   "loop_termination_reason": state.get("loop_termination_reason"),
                   "output_selection_reason": state.get("output_selection_reason"),
                   "output_verified": state.get("output_verified"),
                   "output_draft_sha256": state.get("output_draft_sha256"),
                   "last_checked_draft_sha256": state.get("last_checked_draft_sha256"),
                   "repair_warning": state.get("repair_warning", "")}
    finally:
        T.TUTOR_REPAIR_V2_ENABLED = prev_flag
        client.current_qid = client.current_arm = client.current_round = None
        client.current_context_sha256 = client.current_draft_sha256 = None
    return arm_res, trace, critic_trace


# ── 入口 ─────────────────────────────────────────────────────────────────────
def _make_dir(git_short: str, *, implementation: str = "v2",
              dirty_hash: str = "") -> Path:
    root = (_V3_RESULTS_ROOT if implementation == "v3" and RESULTS_ROOT == _DEFAULT_RESULTS_ROOT
            else RESULTS_ROOT)
    suffix = f"_{dirty_hash[:8]}" if dirty_hash else ""
    d = root / f"{utc_stamp()}_{git_short}{suffix}"
    if d.exists():
        raise FileExistsError(f"结果目录已存在：{d}")
    d.mkdir(parents=True, exist_ok=False)
    return d


def write_v3_run_report(repair_dir: str) -> Path:
    """从原始运行产物确定性生成 14 节证据报告；不代填人工判断。"""
    d = Path(repair_dir)
    manifest = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
    summary = json.loads((d / "summary.json").read_text(encoding="utf-8"))
    arms = _load_jsonl(d / "arm_results.jsonl")
    candidates = _load_jsonl(d / "candidate_trace.jsonl")
    critics = _load_jsonl(d / "critic_trace.jsonl")
    calls = _load_jsonl(d / "llm_calls.jsonl")
    metrics = _load_jsonl(d / "deterministic_metrics.jsonl")

    terms: dict[str, int] = {}
    for row in arms:
        term = str(row.get("termination_reason") or "unknown")
        terms[term] = terms.get(term, 0) + 1
    changed = sum(row.get("final_sha256") != row.get("initial_draft_sha256") for row in arms)
    verified = sum(row.get("output_verified") is True for row in arms)
    revision_ids = {row["id"] for row in arms if int(row.get("revisions", 0) or 0) > 0}
    accepted_patch_ids = {
        row["id"] for row in candidates
        if (row.get("candidate_assessment") or {}).get("accepted") is True
    }
    invalid_revision_count = len(revision_ids - accepted_patch_ids)
    invalid_revision_rate = invalid_revision_count / len(revision_ids) if revision_ids else 0.0
    sanitizer_edits = [edit for row in candidates for edit in (row.get("sanitizer_edits") or [])]
    protected_ok = all(
        edit.get("before_sha256") == M.sha256_text(edit.get("before", ""))
        and edit.get("after_sha256") == M.sha256_text(edit.get("after", ""))
        for edit in sanitizer_edits
    )
    critic_trigger_ids = {
        row["qid"] for row in critics if (row.get("parsed_decision") or {}).get("issues")
    }
    stalled_budget = sum(
        row.get("termination_reason") in {"stalled_same_draft", "budget_exhausted"}
        for row in arms
    )
    stalled_rate = stalled_budget / len(critic_trigger_ids) if critic_trigger_ids else 0.0
    internal_leaks = sum(int(row.get("internal_id_leaks", 0) or 0) for row in metrics)

    historical_tokens = None
    token_reduction = None
    baseline_path = manifest.get("baseline_run_path")
    baseline_integrity_ok = None
    if baseline_path and Path(baseline_path).is_dir():
        budget = historical_budget_if_intact(
            baseline_path, [row["id"] for row in arms],
            saved_manifest_hash=manifest.get("baseline_run_manifest_sha256"),
            saved_calls_hash=manifest.get("baseline_run_llm_calls_sha256"),
        )
        baseline_integrity_ok = budget is not None
        if budget is not None:
            historical_tokens = budget["historical_total_tokens"]
            if historical_tokens:
                token_reduction = 1 - summary["cost"]["total_tokens"] / historical_tokens

    review_rows: list[dict] = []
    with (d / "human_review.csv").open(encoding="utf-8", newline="") as handle:
        review_rows = list(csv.DictReader(handle))
    judgment_fields = (
        "initial_answer_correct", "critic_decision", "critic_issue_supported",
        "repair_attempted", "repair_success", "introduced_new_error",
        "regression_severity", "final_answer_better",
    )
    reviewed = sum(all(str(row.get(field, "")).strip() for field in judgment_fields)
                   for row in review_rows)

    p9 = ("PASS" if token_reduction is not None and token_reduction >= 0.30
          else "FAIL" if token_reduction is not None
          else "PENDING")
    p9_detail = (
        f"V3={summary['cost']['total_tokens']}, V2={historical_tokens}, reduction="
        f"{token_reduction:.1%}"
        if token_reduction is not None else
        ("baseline manifest changed; token comparison unavailable" if baseline_integrity_ok is False
         else "baseline token comparison unavailable")
    )
    gate_rows = [
        ("P1", "PASS" if internal_leaks == 0 else "FAIL", f"final internal-ID leaks={internal_leaks}"),
        ("P2", "PASS" if protected_ok else "FAIL", f"sanitizer edits={len(sanitizer_edits)}"),
        ("P3", "PENDING", "EQ-029/EQ-036 require output-level human review"),
        ("P4", "PENDING", "new high-severity errors require human review"),
        ("P5", p5_gate(accepted_patch_ids), f"accepted patch qids={sorted(accepted_patch_ids)}"),
        ("P6", "PASS" if invalid_revision_rate <= 0.20 else "FAIL",
         f"invalid revisions={invalid_revision_count}/{len(revision_ids)} ({invalid_revision_rate:.1%})"),
        ("P7", "PENDING", "human-confirmed repair success is not yet available"),
        ("P8", "PASS" if stalled_rate <= 0.20 else "FAIL",
         f"same-draft+budget={stalled_budget}/{len(critic_trigger_ids)} ({stalled_rate:.1%})"),
        ("P9", p9, p9_detail),
        ("P10", "PASS" if reviewed == len(arms) and len(arms) > 0 else "PENDING",
         f"completed human reviews={reviewed}/{len(arms)}"),
    ]

    lines = [
        "# Critic / Revise V3 Run Report\n\n",
        "## 1. 执行结论\n\n",
        f"运行状态 `{summary['status']}`；16 题门槛尚未全部完成，禁止据此启动 38 题。\n\n",
        "## 2. 代码事实\n\n",
        "V3 使用确定性 sanitizer、证据校验、局部 replace patch、候选复核和最终 SHA 对齐。\n\n",
        "## 3. 输入、版本、配置和哈希\n\n",
        f"- Run: `{manifest['run_id']}`\n- Git: `{manifest.get('git_head')}` (dirty={manifest.get('git_dirty')})\n"
        f"- Dataset SHA-256: `{manifest.get('dataset_sha256')}`\n"
        f"- Evidence SHA-256: `{manifest.get('evidence_snapshot_sha256')}`\n- CoVe: `{manifest.get('cove_enabled')}`\n\n",
        "## 4. 逐题 Initial / V2 / V3 对照索引\n\n",
        "| QID | revisions | termination | changed from initial | output verified |\n|---|---:|---|---|---|\n",
    ]
    for row in arms:
        lines.append(
            f"| {row['id']} | {row.get('revisions', 0)} | {row.get('termination_reason')} | "
            f"{row.get('final_sha256') != row.get('initial_draft_sha256')} | {row.get('output_verified')} |\n"
        )
    lines.extend([
        "\n## 5. Critic 判断与证据校验\n\n",
        f"Critic rows={len(critics)}；触发题={len(critic_trigger_ids)}。TP/FP/FN/TN 待人工 adjudication。\n\n",
        "## 6. Sanitizer 与 patch 轨迹\n\n",
        f"Sanitizer edits={len(sanitizer_edits)}；Revise 题={len(revision_ids)}；"
        f"候选验收题={len(accepted_patch_ids)}。完整细节见 `candidate_trace.jsonl`。\n\n",
        "## 7. 修订成功、无效修订和退化\n\n",
        f"机器可判无效修订={invalid_revision_count}/{len(revision_ids)} ({invalid_revision_rate:.1%})；"
        "退化严重度待人工复核。\n\n",
        "## 8. CoVe 增量诊断\n\n",
        "本次为 CoVe-off 隔离实验；不得从本运行推断 CoVe 增量收益。\n\n",
        "## 9. 调用、Token、延迟和成本\n\n",
        f"物理/逻辑调用={summary['cost']['physical_calls']}/{summary['cost']['logical_calls']}；"
        f"prompt/completion/total={summary['cost']['prompt_tokens']}/"
        f"{summary['cost']['completion_tokens']}/{summary['cost']['total_tokens']}；"
        f"估算成本=CNY {summary['cost']['estimated_cost_cny']:.6f}。\n\n",
        "## 10. 人工复核\n\n",
        f"已完成 {reviewed}/{len(arms)}；空白判断不得解释为已审核。\n\n",
        "## 11. 实验结果与 P1–P10\n\n",
        "| Gate | Status | Evidence |\n|---|---|---|\n",
    ])
    for gate, status, evidence in gate_rows:
        lines.append(f"| {gate} | {status} | {evidence} |\n")
    lines.extend([
        "\n## 12. 合理推断\n\n",
        f"V3 改变初稿 {changed}/{len(arms)}，最终机器标记 verified {verified}/{len(arms)}；"
        "安全门能够拒绝非法或引入新问题的候选。\n\n",
        "## 13. 当前局限\n\n",
        "机器 `passed` 不等于事实正确；人工复核未完成，且本次样本不是总体质量估计。\n\n",
        "## 14. 分项决策\n\n",
        "- 启用 V3：待 P1–P10 全部完成后决定。\n"
        "- CoVe 默认值：待独立增量诊断。\n"
        "- 扩大到 38 题：当前禁止。\n",
    ])
    out = d / "REPORT.md"
    out.write_text("".join(lines), encoding="utf-8")
    return out


def run_repair(source_run: str, repair_modes: list[str], ids: list[str] | None,
               preflight_only: bool, confirm_paid: bool, post_fn=None, *,
               baseline_run: str | None = None, implementation: str = "v2",
               cove_enabled: bool = False) -> dict:
    started_at = datetime.now(timezone.utc)
    src = Path(source_run).resolve()
    recovered = recover_source(source_run)
    dataset_ids = sorted(r["id"] for r in _load_jsonl(src / "dataset_snapshot.jsonl"))
    target_ids = list(ids) if ids is not None else dataset_ids
    missing = [q for q in target_ids if q not in recovered["records"]]
    try:
        source_manifest = json.loads((src / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        source_manifest = {}
    preflight_errors: list[str] = []
    if source_manifest.get("status") != "complete":
        preflight_errors.append("source_run_manifest_not_complete")
    if recovered["unrecoverable"]:
        preflight_errors.append("unrecoverable_source_records")

    print("=" * 64)
    print(f"  critic_repair_eval  source-run={src.name}")
    print(f"  可恢复题数={len(recovered['records'])}  不可恢复={recovered['unrecoverable']}")
    print(f"  目标题={len(target_ids)}  缺失/不可恢复目标={missing}")
    passed = not missing and not preflight_errors
    if preflight_only:
        snapshot = None
        if baseline_run:
            snapshot = build_preflight_snapshot(
                source_run, baseline_run, target_ids,
                implementation=implementation, cove_enabled=cove_enabled,
            )
            budget = snapshot["budget"]
            print(f"  source={snapshot['source_run_path']}")
            print(f"  baseline={snapshot['baseline_run_path']}")
            print(f"  dataset_sha256={snapshot['dataset_sha256']}")
            print(f"  evidence_sha256={snapshot['evidence_snapshot_sha256']}")
            print(f"  git_head={snapshot['git'].get('head')} dirty={bool(snapshot['git'].get('status_porcelain'))}")
            print(f"  historical physical/logical calls="
                  f"{budget['historical_physical_calls']}/{budget['historical_logical_calls']}")
            print(f"  historical total tokens={budget['historical_total_tokens']}")
            print(f"  worst-case calls/tokens="
                  f"{budget['worst_case_physical_calls']}/{budget['worst_case_total_tokens']}")
            print(f"  estimated historical cost=CNY {budget['estimated_cost_cny']:.6f}")
            print(f"  worst-case cost upper bound=CNY {budget['worst_case_cost_upper_bound_cny']:.6f} "
                  f"({budget['cost_note']})")
        print(f"  预检{'PASS' if passed else 'FAIL'}（无付费）")
        return {"passed": passed, "missing": missing, "recovered": len(recovered["records"]),
                "preflight_errors": preflight_errors,
                "recovery_errors": recovered.get("recovery_errors", {}),
                "preflight_snapshot": snapshot}

    if not confirm_paid and post_fn is None:
        print("[拒绝] 会产生付费 LLM 调用，必须 --confirm-paid。未执行任何调用。")
        return {"passed": False, "reason": "not_confirmed"}
    if missing or preflight_errors:
        print(f"[中止] source-run 预检失败：missing={missing}, errors={preflight_errors}")
        return {"passed": False, "missing": missing, "preflight_errors": preflight_errors}

    git_snapshot = build_git_snapshot()
    results_dir = _make_dir(
        git_snapshot.get("head_short") or "nogit",
        implementation=implementation,
        dirty_hash=git_snapshot.get("tracked_diff_sha256", ""),
    )
    dataset_path = src / "dataset_snapshot.jsonl"
    dataset_rows = _load_jsonl(dataset_path)
    write_json(results_dir / "source_run.json", {
        "source_run": str(src), "modes": repair_modes, "ids": target_ids,
        "source_run_manifest_sha256": _file_sha256(src / "manifest.json"),
        "baseline_run": str(Path(baseline_run).resolve()) if baseline_run else None,
        "baseline_run_manifest_sha256": (_file_sha256(Path(baseline_run).resolve() / "manifest.json")
                                           if baseline_run else None),
        "baseline_run_llm_calls_sha256": (_file_sha256(Path(baseline_run).resolve() / "llm_calls.jsonl")
                                            if baseline_run else None),
    })
    write_jsonl(results_dir / "dataset_snapshot.jsonl", dataset_rows)
    evidence_rows = [{
        "qid": q,
        "context": recovered["records"][q]["evidence"]["context"],
        "context_sha256": recovered["records"][q]["evidence"]["context_sha256"],
        "items": recovered["records"][q]["evidence"]["items"],
        "generate_call_id": recovered["records"][q]["generate_call_id"],
        "generate_request_sha256": recovered["records"][q]["generate_request_sha256"],
        "initial_draft_sha256": T._draft_sha256(recovered["records"][q]["initial_draft"]),
    } for q in target_ids]
    write_jsonl(results_dir / "evidence_snapshot.jsonl", evidence_rows)
    config_snapshot = build_config_snapshot()
    try:
        source_manifest = json.loads((src / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        source_manifest = {}
    resolved_models = {
        "critic_standard": config_snapshot.get("route_model", {}).get("critique"),
        "critic_cove": config_snapshot.get("route_model", {}).get("critique"),
        "revise": config_snapshot.get("route_model", {}).get("revise"),
    }
    manifest = {
        "kind": "critic_repair_eval",
        "run_id": results_dir.name,
        "status": "running",
        "started_at": started_at.isoformat(),
        "finished_at": None,
        "timezone": "UTC",
        "git_head": git_snapshot.get("head"),
        "git_branch": git_snapshot.get("branch"),
        "git_dirty": bool(git_snapshot.get("status_porcelain")),
        "git_diff_sha256": git_snapshot.get("tracked_diff_sha256"),
        "implementation_version": implementation,
        "source_run_path": str(src),
        "source_run_manifest_sha256": _file_sha256(src / "manifest.json"),
        "baseline_run_path": str(Path(baseline_run).resolve()) if baseline_run else None,
        "baseline_run_manifest_sha256": (_file_sha256(Path(baseline_run).resolve() / "manifest.json")
                                           if baseline_run else None),
        "baseline_run_llm_calls_sha256": (_file_sha256(Path(baseline_run).resolve() / "llm_calls.jsonl")
                                            if baseline_run else None),
        "dataset_path": str(dataset_path),
        "dataset_sha256": _file_sha256(dataset_path),
        "dataset_count": len(dataset_rows),
        "evidence_snapshot_sha256": _file_sha256(results_dir / "evidence_snapshot.jsonl"),
        "knowledge_base_fingerprint": (
            source_manifest.get("knowledge_base_fingerprint") or source_manifest.get("kb_index")
        ),
        "model_route_by_stage": {
            "critic_standard": "critique", "critic_cove": "critique", "revise": "revise",
        },
        "resolved_model_by_stage": resolved_models,
        "temperature_by_stage": {
            "critic_standard": 0.1, "critic_cove": 0.1, "revise": 0.1,
        },
        "max_tokens_by_stage": {
            "critic_standard": None, "critic_cove": None, "revise": None,
        },
        "thinking_by_stage": {
            stage: bool(config_snapshot.get("LLM_ENABLE_THINKING")) for stage in resolved_models
        },
        "config": config_snapshot,
        "cove_enabled": bool(cove_enabled),
        "repair_max_revisions": int(T.TUTOR_REPAIR_MAX_REVISIONS),
        "min_confidence": float(T.TUTOR_REPAIR_MIN_CONFIDENCE),
        "error_book_enabled": False,
        "semantic_cache_enabled": False,
        "python_version": sys.version.split()[0],
        "package_lock_sha256": _file_sha256(GMP_API_DIR / "requirements.txt"),
        "pricing_snapshot": dict(_PRICING_SNAPSHOT),
        "pricing_source": _PRICING_SOURCE,
        "pricing_checked_at": _PRICING_CHECKED_AT,
        "errors": [],
    }
    write_json(results_dir / "manifest.json", manifest)

    client = RepairClient(post_fn=post_fn)
    arm_rows, trace_rows, critic_rows, errors = [], [], [], []
    orig_llm = T._llm_chat
    orig_cove = T.COVE_ENABLED
    T._llm_chat = client                 # 装上可观测客户端：所有 LLM 调用经它记录/去重/契约校验
    T.COVE_ENABLED = bool(cove_enabled)
    try:
        for qid in target_ids:
            for mode in repair_modes:
                try:
                    res, tr, ctr = run_one_repair(qid, recovered["records"][qid], mode, client)
                except Exception as e:  # noqa: BLE001  §11.3/§20：单题失败落盘、不崩整轮
                    errors.append({"id": qid, "mode": mode, "error": repr(e)})
                    arm_rows.append({"id": qid, "mode": mode, "error": repr(e)})
                    print(f"  [ERR] {qid}/{mode}: {e!r}")
                    continue
                arm_rows.append(res)
                trace_rows.extend(tr)
                critic_rows.extend(ctr)
                print(f"  {qid}/{mode}: rev={res.get('revisions')} term={res.get('termination_reason')}")
    finally:
        T._llm_chat = orig_llm
        T.COVE_ENABLED = orig_cove
    write_jsonl(results_dir / "arm_results.jsonl", arm_rows)
    write_jsonl(results_dir / "candidate_trace.jsonl", trace_rows)
    write_jsonl(results_dir / "critic_trace.jsonl", critic_rows)
    write_jsonl(results_dir / "llm_calls.jsonl", client.calls)
    deterministic_rows = []
    for row in arm_rows:
        if row.get("error"):
            continue
        answer = row.get("final_answer", "")
        deterministic_rows.append({
            "qid": row["id"], "arm": row["mode"],
            "final_answer_sha256": T._draft_sha256(answer),
            "internal_id_leaks": M.count_internal_id_leaks(answer),
            "citation_format_valid_rate": M.citation_format_valid_rate(answer),
            "output_verified": row.get("output_verified"),
            "termination_reason": row.get("termination_reason"),
        })
    write_jsonl(results_dir / "deterministic_metrics.jsonl", deterministic_rows)

    review_fields = [
        "qid", "arm", "initial_answer_correct", "critic_decision",
        "critic_issue_supported", "repair_attempted", "repair_success",
        "introduced_new_error", "regression_severity", "final_answer_better",
        "reviewer", "reviewed_at", "notes",
    ]
    with (results_dir / "human_review.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=review_fields)
        writer.writeheader()
        for row in arm_rows:
            if not row.get("error"):
                writer.writerow({"qid": row["id"], "arm": row["mode"]})

    physical = [call for call in client.calls if call.get("physical_call")]
    live_physical = [call for call in physical if call.get("execution_mode") == "live"]
    def _tokens(name: str) -> int:
        return sum(int((call.get("usage") or {}).get(name, 0) or 0)
                   for call in live_physical)
    summary = {
        "status": "failed" if errors else "complete",
        "n_questions": len(target_ids),
        "n_errors": len(errors),
        "cost": {
            "logical_calls": len(client.calls),
            "physical_calls": len(physical),
            "successful_physical_calls": len(live_physical),
            "prompt_tokens": _tokens("prompt_tokens"),
            "completion_tokens": _tokens("completion_tokens"),
            "total_tokens": _tokens("total_tokens"),
            "estimated_cost_cny": _estimated_cost_cny(
                _tokens("prompt_tokens"), _tokens("completion_tokens")
            ),
            "pricing_snapshot": dict(_PRICING_SNAPSHOT),
        },
    }
    write_json(results_dir / "summary.json", summary)
    write_v3_run_report(str(results_dir))

    manifest.update({
        "status": summary["status"],
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "errors": errors,
        "n_ids": len(target_ids),
        "artifact_sha256": {
            name: _file_sha256(results_dir / name)
            for name in _REQUIRED_RUN_ARTIFACTS if (results_dir / name).is_file()
        },
    })
    write_json(results_dir / "manifest.json", manifest)
    n_live = len(live_physical)
    print(f"  完成：{len(target_ids)} 题 × {repair_modes}  错误 {len(errors)}")
    print(f"  逻辑调用 {len(client.calls)} / 物理(live) {n_live}  结果目录：{results_dir.resolve()}")
    return {"passed": not errors, "results_dir": str(results_dir.resolve()),
            "n_errors": len(errors), "physical_calls": n_live}


# ── §14 Judge：盲评 initial/legacy/v2 语义覆盖 + 忠实（回答 E7/E8）─────────────
def run_repair_judge(repair_dir: str, source_run: str, confirm_paid: bool,
                     judge_model: str = "qwen-max", post_fn=None) -> dict:
    if not confirm_paid and post_fn is None:
        print("[拒绝] Judge 会产生付费 LLM 调用，必须 --confirm-paid。")
        return {"passed": False, "reason": "not_confirmed"}
    d = Path(repair_dir)
    rec = recover_source(source_run)["records"]
    gen = {g["id"]: g for g in _load_jsonl(Path(source_run) / "generation.jsonl")}
    arms: dict = {}
    for a in _load_jsonl(d / "arm_results.jsonl"):
        if "error" in a:
            continue
        arms.setdefault(a["id"], {})[a["mode"]] = a

    variants: dict[str, dict] = {}
    for qid, per in arms.items():
        if "legacy" not in per or "v2" not in per or qid not in rec:
            continue
        variants[qid] = {"initial": rec[qid]["initial_draft"],
                         "legacy": per["legacy"]["final_answer"],
                         "v2": per["v2"]["final_answer"]}

    judged: dict = {}   # (qid, sha) -> {coverage, faithfulness}
    for qid, vs in variants.items():
        aps = rec[qid]["answer_points"]
        ctx = gen.get(qid, {}).get("gen_contexts", [])
        for ans in set(vs.values()):
            sha = M.sha256_text(ans)
            if (qid, sha) in judged:
                continue
            cov, _ = parse_coverage(_judge_call(build_coverage_prompt(rec[qid]["question"], ans, aps),
                                                judge_model, post_fn), len(aps))
            ff, _ = parse_faithfulness(_judge_call(build_faithfulness_prompt(rec[qid]["question"], ans, ctx),
                                                   judge_model, post_fn))
            judged[(qid, sha)] = {"coverage": cov, "faithfulness": ff}

    rows = []
    for qid, vs in variants.items():
        row = {"qid": qid}
        for label, ans in vs.items():
            row[label] = judged[(qid, M.sha256_text(ans))]
        rows.append(row)
    write_jsonl(d / "judge_results.jsonl", rows)

    def _pair(a, b, metric):
        return [row[a][metric] - row[b][metric] for row in rows
                if row[a][metric] is not None and row[b][metric] is not None]

    def _mac(label, metric):
        xs = [row[label][metric] for row in rows if row[label][metric] is not None]
        return sum(xs) / len(xs) if xs else None

    def _pair_stat(a, b, metric):
        diffs = _pair(a, b, metric)
        return {"n": len(diffs), "mean_diff": (sum(diffs) / len(diffs) if diffs else None),
                "ci95": M.paired_bootstrap_ci(diffs, iters=10000, seed=0),
                "improved": sum(1 for x in diffs if x > 0), "degraded": sum(1 for x in diffs if x < 0),
                "mcnemar_p": M.mcnemar_exact(sum(1 for x in diffs if x > 0), sum(1 for x in diffs if x < 0))}

    summary = {
        "judge_model": judge_model, "n_questions": len(rows),
        "macro": {label: {"coverage": _mac(label, "coverage"), "faithfulness": _mac(label, "faithfulness")}
                  for label in ("initial", "legacy", "v2")},
        "v2_vs_legacy": {"coverage": _pair_stat("v2", "legacy", "coverage"),
                         "faithfulness": _pair_stat("v2", "legacy", "faithfulness")},
        "v2_vs_initial": {"coverage": _pair_stat("v2", "initial", "coverage"),
                          "faithfulness": _pair_stat("v2", "initial", "faithfulness")},
        "legacy_vs_initial": {"coverage": _pair_stat("legacy", "initial", "coverage"),
                              "faithfulness": _pair_stat("legacy", "initial", "faithfulness")},
    }
    write_json(d / "judge_summary.json", summary)
    print(f"  Judge 完成 → {(d / 'judge_summary.json').resolve()}")
    m = summary["macro"]
    print(f"  语义覆盖 initial/legacy/v2 = "
          f"{m['initial']['coverage']}/{m['legacy']['coverage']}/{m['v2']['coverage']}")
    print(f"  忠实 initial/legacy/v2 = "
          f"{m['initial']['faithfulness']}/{m['legacy']['faithfulness']}/{m['v2']['faithfulness']}")
    return {"passed": True, "summary": summary}


# ── §17 REPORT.md（无付费；确定性 + Judge 已有则并入；人工项标待办）──────────
def _fmt(v) -> str:
    if v is None:
        return "N/A"
    if isinstance(v, float):
        return f"{v:.3f}"
    if isinstance(v, (list, tuple)):
        return "[" + ", ".join(_fmt(x) for x in v) + "]"
    return str(v)


def write_repair_report(repair_dir: str, source_run: str) -> Path:
    d = Path(repair_dir)
    rec = recover_source(source_run)["records"]
    arms: dict = {}
    for a in _load_jsonl(d / "arm_results.jsonl"):
        if "error" in a:
            arms.setdefault(a["id"], {})[a.get("mode", "?")] = a
            continue
        arms.setdefault(a["id"], {})[a["mode"]] = a
    calls = _load_jsonl(d / "llm_calls.jsonl") if (d / "llm_calls.jsonl").exists() else []
    judge = None
    if (d / "judge_summary.json").exists():
        judge = json.loads((d / "judge_summary.json").read_text(encoding="utf-8"))

    def idleak(s):
        return M.count_internal_id_leaks(s or "")

    # 逐题确定性
    ib = lb = vb = 0
    per_lines = []
    for qid in sorted(arms):
        if "legacy" not in arms[qid] or "v2" not in arms[qid]:
            continue
        init = rec[qid]["initial_draft"]
        leg = arms[qid]["legacy"].get("final_answer", "")
        v2 = arms[qid]["v2"].get("final_answer", "")
        i, l, v = idleak(init), idleak(leg), idleak(v2)
        ib += i; lb += l; vb += v
        per_lines.append(f"| {qid} | {i}/{l}/{v} | {arms[qid]['legacy'].get('termination_reason','ERR')}/"
                         f"{arms[qid]['legacy'].get('revisions','-')} | "
                         f"{arms[qid]['v2'].get('termination_reason','ERR')}/{arms[qid]['v2'].get('revisions','-')} |")

    # 效率
    def _stage(arm):
        cs = [c for c in calls if c.get("arm") == arm]
        live = [c for c in cs if c.get("execution_mode") == "live"]
        tok = sum((c.get("usage") or {}).get("total_tokens", 0) or 0 for c in live)
        lats = [c["latency_ms"] for c in live if c.get("latency_ms") is not None]
        return {"logical": len(cs), "physical": len(live), "tokens": tok,
                "p50": M.percentile_hf7(lats, 50), "p95": M.percentile_hf7(lats, 95)}
    eff = {arm: _stage(arm) for arm in ("legacy", "v2")}

    L = ["# Critic/Revise 修复评测报告（05 §17）\n\n"]
    L.append("> 本报告区分：代码事实 / 实验结果 / 合理推断 / 当前局限。语义与人工项在末尾标注待办。\n\n")
    L.append("## 1. 执行摘要\n")
    L.append(f"- 源运行(source-run，只读)：`{Path(source_run).name}`；本次题数：{len(per_lines)}。\n")
    L.append(f"- 内部 ID 泄漏合计 初稿/legacy/v2 = **{ib} / {lb} / {vb}**。\n")
    if judge:
        m = judge["macro"]
        L.append(f"- 语义覆盖 initial/legacy/v2 = {_fmt(m['initial']['coverage'])} / "
                 f"{_fmt(m['legacy']['coverage'])} / {_fmt(m['v2']['coverage'])}；"
                 f"忠实 = {_fmt(m['initial']['faithfulness'])} / {_fmt(m['legacy']['faithfulness'])} / "
                 f"{_fmt(m['v2']['faithfulness'])}。\n")
    L.append("\n## 2. 代码事实\n- V1(legacy)：Critic 只用 reg_docs[:5]、盲修(温度0.3)、仅步数上限。\n"
             "- V2：Generate=Critic 同一证据契约；结构化 Critic(JSON,fail-closed)；有证据最小修订(温度0.1)；"
             "停滞/退化/最佳稿护栏；Error Book 注入评测期关。V2 默认关(TUTOR_REPAIR_V2_ENABLED=false)。\n")
    L.append("\n## 3. 逐题 legacy/v2（ID泄漏 初/legacy/v2 · 终止/修订轮）\n")
    L.append("| 题 | IDleak 初/leg/v2 | legacy 终止/轮 | v2 终止/轮 |\n|---|---|---|---|\n")
    L.extend(x + "\n" for x in per_lines)
    L.append("\n## 4. 效率（物理=live）\n| 组 | 逻辑 | 物理 | live总token | P50ms | P95ms |\n|---|---|---|---|---|---|\n")
    for arm in ("legacy", "v2"):
        e = eff[arm]
        L.append(f"| {arm} | {e['logical']} | {e['physical']} | {e['tokens']} | {_fmt(e['p50'])} | {_fmt(e['p95'])} |\n")
    L.append("\n> 成本：需运行当日官方价格快照才可换算 ¥（§12）；本报告只报 token/调用，未臆造价格。\n")
    if judge:
        L.append("\n## 5. 语义 Judge（§14 辅助，非主结论）\n")
        for pair in ("v2_vs_legacy", "v2_vs_initial", "legacy_vs_initial"):
            c = judge[pair]["coverage"]
            f = judge[pair]["faithfulness"]
            L.append(f"- **{pair}**：覆盖 mean={_fmt(c['mean_diff'])} CI={_fmt(c['ci95'])} "
                     f"改善/退化={c['improved']}/{c['degraded']} McNemar p={_fmt(c['mcnemar_p'])}；"
                     f"忠实 mean={_fmt(f['mean_diff'])} 改善/退化={f['improved']}/{f['degraded']}。\n")
    L.append("\n## 6. 待办（人工 + 其他）\n"
             "- Critic 真/假阳性混淆矩阵、修订成功/退化严重度：需盲化人工复核 `human_review.csv`（E7/E8/E10）。\n"
             "- CoVe 增量：见 §14 故障注入诊断（critic_fault_injection）。\n"
             "- 成本 ¥：需当日价格快照。\n")
    L.append("\n## 7. 分项建议（据确定性 + Judge，人工确认前为初步）\n")
    v2_wins = judge and judge["v2_vs_legacy"]["coverage"]["improved"] >= judge["v2_vs_legacy"]["coverage"]["degraded"]
    L.append(f"- **启用 V2**：{'建议' if (vb <= ib and (v2_wins or not judge)) else '存疑'}"
             f"（v2 内部ID泄漏 {vb} ≤ 初稿 {ib}；legacy {lb}）。\n")
    L.append("- **最大修订轮数=2**：护栏下预算耗尽即返回最佳稿，未见硬伤，建议维持。\n")
    L.append("- **CoVe 默认**：以 §14 故障注入诊断结论为准（0 增量则建议关）。\n")

    (d / "REPORT.md").write_text("".join(L), encoding="utf-8")
    print(f"  REPORT.md written → {(d / 'REPORT.md').resolve()}")
    return d / "REPORT.md"


# ── §14.2 人工盲标样本预生成（不代替人工判断，只挑样本 + 预填上下文）──────────
def write_human_review(repair_dir: str, source_run: str) -> Path:
    import csv
    d = Path(repair_dir)
    rec = recover_source(source_run)["records"]
    arms: dict = {}
    for a in _load_jsonl(d / "arm_results.jsonl"):
        if "error" in a:
            continue
        arms.setdefault(a["id"], {})[a["mode"]] = a

    selected = []
    for qid in sorted(arms):
        per = arms[qid]
        if "legacy" not in per or "v2" not in per:
            continue
        init = rec[qid]["initial_draft"]
        leg, v2 = per["legacy"]["final_answer"], per["v2"]["final_answer"]
        reasons = []
        if per["v2"].get("revisions", 0) > 0:
            reasons.append("v2发生修订")
        if per["legacy"].get("revisions", 0) > 0:
            reasons.append("legacy发生修订")
        if leg != v2:
            reasons.append("legacy≠v2")
        if per["v2"].get("termination_reason") not in (None, "passed"):
            reasons.append(f"v2终止={per['v2'].get('termination_reason')}")
        if M.count_internal_id_leaks(leg) or M.count_internal_id_leaks(init):
            reasons.append("legacy/初稿有内部ID泄漏")
        if reasons:
            selected.append((qid, "；".join(reasons), init, leg, v2, per))

    fields = ["id", "为何入选", "问题", "金标要点", "初稿", "legacy终稿", "v2终稿",
              "v2修订轮", "v2终止",
              "①初稿是否正确(Y/N/部分)", "②v2触发是真问题还是假阳性(真/假/不确定/无触发)",
              "③v2相对初稿(更好/相同/更差)", "④v2相对legacy(更好/相同/更差)",
              "⑤是否有新高危错误(有/无)", "备注"]
    out = d / "human_review.csv"
    with out.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for qid, why, init, leg, v2, per in selected:
            w.writerow({
                "id": qid, "为何入选": why, "问题": rec[qid]["question"],
                "金标要点": "\n".join(f"{i+1}. {p}" for i, p in enumerate(rec[qid]["answer_points"])),
                "初稿": init, "legacy终稿": leg, "v2终稿": v2,
                "v2修订轮": per["v2"].get("revisions"), "v2终止": per["v2"].get("termination_reason"),
                "①初稿是否正确(Y/N/部分)": "", "②v2触发是真问题还是假阳性(真/假/不确定/无触发)": "",
                "③v2相对初稿(更好/相同/更差)": "", "④v2相对legacy(更好/相同/更差)": "",
                "⑤是否有新高危错误(有/无)": "", "备注": "",
            })
    print(f"  human_review.csv 已生成（{len(selected)} 题待人工判） → {out.resolve()}")
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Critic/Revise 修复评测（05）")
    ap.add_argument("--source-run", required=True)
    ap.add_argument("--baseline-run")
    ap.add_argument("--implementation", choices=["v2", "v3"], default="v2")
    ap.add_argument("--cove", choices=["on", "off"], default="off")
    ap.add_argument("--mode", choices=["legacy", "v2", "paired"], default="paired")
    ap.add_argument("--repair-modes", default="legacy,v2")
    ap.add_argument("--ids", default="")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--preflight-only", action="store_true")
    ap.add_argument("--confirm-paid", action="store_true")
    ap.add_argument("--judge-run", metavar="REPAIR_DIR",
                    help="对已完成的修复评测目录做 §14 Judge（付费）")
    ap.add_argument("--report", metavar="REPAIR_DIR",
                    help="对已完成的修复评测目录生成 §17 REPORT.md（无付费）")
    ap.add_argument("--human-review", metavar="REPAIR_DIR",
                    help="生成 §14.2 人工盲标样本 human_review.csv（无付费）")
    ap.add_argument("--judge-model", default="qwen-max")
    args = ap.parse_args(argv)
    if args.report:
        write_repair_report(args.report, args.source_run)
        return 0
    if args.human_review:
        write_human_review(args.human_review, args.source_run)
        return 0
    if args.judge_run:
        import eval.error_book as eb
        eb.NEGATIVE_INJECTION_ENABLED = False
        res = run_repair_judge(args.judge_run, args.source_run, args.confirm_paid, args.judge_model)
        return 0 if res.get("passed") else 1
    modes = ["legacy", "v2"] if args.mode == "paired" else [args.mode]
    if args.mode == "paired":
        modes = [m.strip() for m in args.repair_modes.split(",") if m.strip()]
    ids = None if args.all else ([x.strip() for x in args.ids.split(",") if x.strip()] or None)
    # §10.3：评测期显式关闭 Error Book 负例注入
    import eval.error_book as eb
    eb.NEGATIVE_INJECTION_ENABLED = False
    if args.implementation == "v3":
        modes = ["v3"]
    res = run_repair(
        args.source_run, modes, ids, args.preflight_only, args.confirm_paid,
        baseline_run=args.baseline_run, implementation=args.implementation,
        cove_enabled=args.cove == "on",
    )
    return 0 if res.get("passed") else 1


if __name__ == "__main__":
    raise SystemExit(main())
