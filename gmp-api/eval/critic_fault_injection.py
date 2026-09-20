# -*- coding: utf-8 -*-
"""§14 CoVe 受控故障注入诊断集（05-critic-revise-hardening）。

12 个最小变体：从真实/标准 GMP 条款出发，每个只改一个事实，用于判断
「普通 Critic 与 CoVe 各能否检出注入的错误」，从而决定 CoVe 是否有增量价值。
本集只报检测灵敏度，绝不并入 38 题自然质量均值，也不称为金标。

注意：cases 由程序化单点变异构造（construction=programmatic_single_mutation），
human_verified=false —— 需人工快速确认「确实是错误且答案其余部分不变」。
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import agents.tutor as T
from eval import critic_metrics as M
from eval.critic_ablation import (
    GMP_API_DIR, build_git_snapshot, write_json, write_jsonl, utc_stamp,
)

OUT_PATH = GMP_API_DIR / "eval" / "critic_fault_injection_cases.jsonl"
RESULTS_ROOT = GMP_API_DIR / "eval" / "results" / "critic_fault_injection_v2"

# 真实/标准 GMP 条款作为证据（前 6 条来自库；粒子阈值用无菌附录标准数值）
_A099 = "纯化水、注射用水的制备、贮存和分配应当能够防止微生物的滋生。注射用水可采用70℃以上保温循环。"
_PLIC009 = "国务院药品监督管理部门应当自受理申请之日起20个工作日内决定是否同意变更。"
_PARTICLE = "A级洁净区在静态条件下，≥0.5μm悬浮粒子的最大允许数为3520个/立方米，≥5.0μm为20个/立方米。"
_BC059 = "所有产品均应当由质量管理部门审核，不合格产品不得放行出厂。"
_CT008 = "负责制备和质量管理的人员不得互相兼任。"
_SH022 = "病毒去除/灭活方法验证中的病毒挑战试验不得使用生产厂房设施和设备。"
_BC028 = "物料的发放应当遵循先进先出和近效期先出的原则，发放应当有记录。"
_BC011 = "企业应当建立与生产管理、质量控制相适应的管理机构，明确规定每个部门的职责，并有组织机构图。"


def _case(cid, evid_id, evid, base, mutated, span, mtype, expect_issue):
    return {
        "case_id": cid, "parent_question_id": "synthetic",
        "evidence_id": evid_id, "evidence_content": evid,
        "source_answer_sha256": M.sha256_text(base),
        "base_answer": base, "mutated_answer": mutated, "mutation_span": span,
        "mutation_type": mtype, "expected_issue_type": expect_issue,
        "expected_evidence_id": evid_id,
        "human_verified": False, "construction": "programmatic_single_mutation",
    }


def build_cases() -> list[dict]:
    return [
        _case("FI-01", "REG-GMP2010-A099", _A099, "注射用水可采用70℃以上保温循环。",
              "注射用水可采用40℃以上保温循环。", "70℃→40℃", "temperature", "fact_contradiction"),
        _case("FI-02", "REG-GMP2010-A099", _A099, "注射用水可采用70℃以上保温循环。",
              "注射用水可采用7℃以上保温循环。", "70℃→7℃", "temperature", "fact_contradiction"),
        _case("FI-03", "REG-PLIC-009", _PLIC009, "应当自受理申请之日起20个工作日内决定。",
              "应当自受理申请之日起5个工作日内决定。", "20→5工作日", "time_limit", "fact_contradiction"),
        _case("FI-04", "REG-PLIC-009", _PLIC009, "应当自受理申请之日起20个工作日内决定。",
              "应当自受理申请之日起60个工作日内决定。", "20→60工作日", "time_limit", "fact_contradiction"),
        _case("FI-05", "REG-APP-STD-PARTICLE", _PARTICLE, "A级洁净区≥0.5μm悬浮粒子最大允许3520个/立方米。",
              "A级洁净区≥0.5μm悬浮粒子最大允许35200个/立方米。", "3520→35200", "threshold", "fact_contradiction"),
        _case("FI-06", "REG-APP-STD-PARTICLE", _PARTICLE, "A级洁净区≥5.0μm悬浮粒子最大允许20个/立方米。",
              "A级洁净区≥5.0μm悬浮粒子最大允许200个/立方米。", "20→200", "threshold", "fact_contradiction"),
        _case("FI-07", "REG-APP-BC-059", _BC059, "不合格产品不得放行出厂。",
              "不合格产品可以放行出厂。", "不得→可以", "negation_flip", "fact_contradiction"),
        _case("FI-08", "REG-APP-CT-008", _CT008, "负责制备和质量管理的人员不得互相兼任。",
              "负责制备和质量管理的人员可以互相兼任。", "不得→可以", "negation_flip", "fact_contradiction"),
        _case("FI-09", "REG-APP-SH-022", _SH022,
              "【条款编号】某条\n【来源】药品生产质量管理规范（2010年修订）\n【原文内容】病毒挑战试验不得使用生产厂房设施和设备。",
              "【条款编号】某条\n【来源】中药制剂附录\n【原文内容】病毒挑战试验不得使用生产厂房设施和设备。",
              "来源错配为中药附录", "source_mismatch", "source_mismatch"),
        _case("FI-10", "REG-APP-BC-050", "直接接触药包材的包装材料不得对药包材质量产生不利影响。",
              "【条款编号】某条\n【来源】药品生产质量管理规范（2010年修订）\n【原文内容】直接接触药包材的包装材料不得对药包材质量产生不利影响。",
              "【条款编号】某条\n【来源】原料药附录\n【原文内容】直接接触药包材的包装材料不得对药包材质量产生不利影响。",
              "来源错配为原料药附录", "source_mismatch", "source_mismatch"),
        _case("FI-11", "REG-APP-BC-028", _BC028, "物料的发放应当遵循先进先出和近效期先出的原则。",
              "物料的发放应当遵循先进先出原则，近效期3个月内的物料必须优先发放。", "增无依据数值3个月",
              "unsupported_number", "fact_contradiction"),
        _case("FI-12", "REG-APP-BC-011", _BC011, "企业应当建立相适应的管理机构并有组织机构图。",
              "企业应当建立相适应的管理机构并有组织机构图，组织机构图应当每2年更新一次。", "增无依据数值每2年",
              "unsupported_number", "fact_contradiction"),
    ]


def _evidence_for(case: dict) -> dict:
    return T._prepare_tutor_evidence([{
        "id": case["evidence_id"], "doc_type": "regulation",
        "title": "", "content": case["evidence_content"], "score": 1.0}])


def _load_or_initialize_cases() -> tuple[list[dict], bool]:
    """读取人工审核数据；已存在时绝不覆盖。"""
    if OUT_PATH.exists():
        rows = [json.loads(line) for line in OUT_PATH.read_text(encoding="utf-8").splitlines()
                if line.strip()]
        return rows, False
    rows = build_cases()
    write_jsonl(OUT_PATH, rows)
    return rows, True


def summarize_increment(rows: list[dict]) -> dict:
    """仅在人工确认且被 plain Critic 漏检的样本上报告 CoVe 增量。"""
    verified = [row for row in rows if row.get("human_verified") is True]
    eligible = [row for row in verified if row.get("plain_critic_caught") is False]
    true_positives = sum(1 for row in eligible
                         if row.get("cove_caught_after_plain_miss") is True)
    denominator = len(eligible)
    rate = true_positives / denominator if denominator else None
    if not denominator:
        verdict = "证据不足：没有人工确认且被 plain Critic 漏检的合格分母，不能报告 CoVe 增量率"
    elif true_positives:
        verdict = f"CoVe 在 {denominator} 个合格 plain miss 中补检 {true_positives} 个"
    else:
        verdict = f"CoVe 在 {denominator} 个合格 plain miss 中未补检任何错误"
    return {
        "verified_cases": len(verified),
        "increment_denominator": denominator,
        "cove_increment_true_positives": true_positives,
        "increment_rate": rate,
        "verdict": verdict,
    }


def run_diagnostic(confirm_paid: bool, post_fn=None) -> dict:
    """对每个变体：①普通 Critic（CoVe 关）能否检出；②若普通 Critic 漏检，CoVe 能否补检。"""
    cases, created = _load_or_initialize_cases()
    if not confirm_paid and post_fn is None:
        action = "已初始化" if created else "已读取（未覆盖）"
        print(f"[无付费] {action} {len(cases)} 个故障注入变体 → {OUT_PATH}")
        print("        运行检测诊断需 --confirm-paid（会调 LLM）。")
        return {"passed": True, "cases_loaded": len(cases), "cases_created": created,
                "ran_diagnostic": False}

    llm = post_fn or T._llm_chat
    prev_cove = T.COVE_ENABLED
    prev_llm = T._llm_chat
    rows = []
    try:
        for c in cases:
            ev = _evidence_for(c)
            # ① 普通 Critic（含确定性 + LLM），CoVe 关
            T.COVE_ENABLED = False
            det = T._check_output_contract(c["mutated_answer"], ev)
            det_caught = bool(det)
            T._llm_chat = llm  # ensure using provided
            dec = T._critique_answer_v2("请核查该表述是否与证据一致", c["mutated_answer"], ev)
            plain_caught = not dec["passed"]
            # ② 若普通 Critic 通过（漏检），单独跑 CoVe
            cove_caught = None
            cove_audit = None
            if dec["passed"]:
                cove_audit = {}
                cove_issue = T._cove_verify(c["mutated_answer"], ev["context"], audit=cove_audit)
                cove_caught = bool(cove_issue)
            rows.append({
                "case_id": c["case_id"], "mutation_type": c["mutation_type"],
                "expected_issue_type": c["expected_issue_type"],
                "human_verified": c.get("human_verified") is True,
                "deterministic_caught": det_caught,
                "plain_critic_caught": plain_caught,
                "cove_caught_after_plain_miss": cove_caught,
                "cove_increment": bool(dec["passed"] and cove_caught),
                "critic_issue_types": [i["issue_type"] for i in dec["issues"]],
                "plain_critic_raw_response": dec.get("raw_response"),
                "cove_trace": cove_audit,
            })
    finally:
        T.COVE_ENABLED = prev_cove
        T._llm_chat = prev_llm

    git = build_git_snapshot()
    dirty_suffix = f"_{git.get('tracked_diff_sha256', '')[:8]}" if git.get("status_porcelain") else ""
    d = RESULTS_ROOT / f"{utc_stamp()}_{git.get('head_short') or 'nogit'}{dirty_suffix}"
    d.mkdir(parents=True, exist_ok=False)
    write_jsonl(d / "diagnostic_results.jsonl", rows)
    n = len(rows)
    plain = sum(1 for r in rows if r["plain_critic_caught"])
    det = sum(1 for r in rows if r["deterministic_caught"])
    summary = {"n_cases": n, "deterministic_caught": det, "plain_critic_caught": plain,
               **summarize_increment(rows)}
    write_json(d / "summary.json", summary)
    print(f"  故障注入诊断：{n} 例  确定性检出 {det} / 普通Critic检出 {plain} / "
          f"CoVe增量 {summary['cove_increment_true_positives']}/{summary['increment_denominator']}")
    print(f"  结论：{summary['verdict']}")
    print(f"  结果目录：{d.resolve()}")
    return {"passed": True, "summary": summary}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="§14 CoVe 故障注入诊断")
    ap.add_argument("--confirm-paid", action="store_true")
    args = ap.parse_args(argv)
    run_diagnostic(args.confirm_paid)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
