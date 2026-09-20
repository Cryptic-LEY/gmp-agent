# -*- coding: utf-8 -*-
"""critic_ablation / critic_metrics 单元测试（不访问真实 LLM / 真实 MySQL）。

对应规格 04-critic-cove-ablation.md §10、§21。
本文件先覆盖 critic_metrics 的纯函数（确定性、可离线）；
harness 调用链测试（共享初稿、CoVe 隔离、配置恢复等）随 critic_ablation 落地补充。
"""
import hashlib
import json
import sys
from types import SimpleNamespace

import pytest

from eval import critic_metrics as M


# ── §7 数据集契约 ────────────────────────────────────────────────────────────
def _good_records():
    recs = []
    for i in range(1, 39):
        recs.append({
            "id": f"EQ-{i:03d}",
            "question": f"问题{i}",
            "answer_points": [f"要点{i}"],
            "expect_reg_ids": ["REG-GMP2010-A001"],
            "expect_kp_ids": ["KP-BK-001"],
            "annotator": "expert",
        })
    return recs


def test_validate_dataset_accepts_clean_38():
    assert M.validate_dataset(_good_records()) == []


def test_validate_dataset_rejects_wrong_count():
    recs = _good_records()[:37]
    v = M.validate_dataset(recs)
    assert any("38" in x for x in v)


def test_validate_dataset_rejects_wrong_ids():
    recs = _good_records()
    recs[0]["id"] = "GS-001"
    v = M.validate_dataset(recs)
    assert any("EQ-001" in x or "GS-001" in x for x in v)


def test_validate_dataset_rejects_non_expert_annotator():
    recs = _good_records()
    recs[5]["annotator"] = "admin"
    v = M.validate_dataset(recs)
    assert any("annotator" in x for x in v)


def test_validate_dataset_rejects_empty_question_or_points():
    recs = _good_records()
    recs[2]["question"] = ""
    recs[3]["answer_points"] = []
    v = M.validate_dataset(recs)
    assert any("question" in x for x in v)
    assert any("answer_points" in x for x in v)


def test_validate_dataset_rejects_bad_anchor_types():
    recs = _good_records()
    recs[4]["expect_reg_ids"] = "REG-GMP2010-A001"  # 应为 list
    v = M.validate_dataset(recs)
    assert any("expect_reg_ids" in x for x in v)


def test_validate_dataset_allows_empty_kp_ids():
    # EQ-026 定稿本就无知识点锚定，空 list 合法（类型正确）
    recs = _good_records()
    recs[25]["expect_kp_ids"] = []
    assert M.validate_dataset(recs) == []


# ── SHA ─────────────────────────────────────────────────────────────────────
def test_sha256_text_matches_hashlib():
    assert M.sha256_text("abc") == hashlib.sha256("abc".encode("utf-8")).hexdigest()


# ── §13.1 检索指标 ───────────────────────────────────────────────────────────
def test_recall_at_k_basic():
    retrieved = ["A", "B", "C", "D"]
    gold = {"B", "D", "X"}
    assert M.recall_at_k(retrieved, gold, 3) == pytest.approx(1 / 3)   # 只命中 B
    assert M.recall_at_k(retrieved, gold, 5) == pytest.approx(2 / 3)   # 命中 B、D


def test_recall_at_k_empty_gold_is_none():
    assert M.recall_at_k(["A"], set(), 3) is None


def test_first_hit_rank_and_mrr():
    retrieved = ["A", "B", "C"]
    gold = {"C"}
    assert M.first_hit_rank(retrieved, gold) == 3
    assert M.mrr(retrieved, gold) == pytest.approx(1 / 3)


def test_mrr_no_hit_is_zero_but_gold_nonempty():
    assert M.mrr(["A", "B"], {"Z"}) == 0.0
    assert M.first_hit_rank(["A", "B"], {"Z"}) is None


def test_mrr_empty_gold_is_none():
    assert M.mrr(["A"], set()) is None


# ── §13.2 引用解析 & 内部 ID 泄漏 ────────────────────────────────────────────
_SAMPLE_ANSWER = """【条款编号】第十一条
【来源】药品生产质量管理规范（2010年修订）
【原文内容】质量控制实验室管理应当符合本规范要求。

【条款编号】第十二条
【来源】药品生产质量管理规范（2010年修订）
【原文内容】企业应当建立文件管理系统。"""


def test_parse_citation_blocks_extracts_triples():
    blocks = M.parse_citation_blocks(_SAMPLE_ANSWER)
    assert len(blocks) == 2
    assert blocks[0]["article"] == "第十一条"
    assert "药品生产质量管理规范" in blocks[0]["source"]
    assert blocks[0]["content"].startswith("质量控制实验室")
    assert blocks[1]["article"] == "第十二条"


def test_parse_citation_blocks_empty_when_no_markers():
    assert M.parse_citation_blocks("这是一段没有引用块的普通回答。") == []


def test_count_internal_id_leaks():
    assert M.count_internal_id_leaks("正常答案，无编号") == 0
    assert M.count_internal_id_leaks("见 REG-GMP2010-A011 和 KP-BK-024") == 2
    assert M.count_internal_id_leaks("REG-PMO-059") == 1


# ── §13.3 要点字面覆盖（确定性下界）────────────────────────────────────────
def test_literal_point_coverage_hits_and_misses():
    answer = "质量保证QA负责整个质量管理体系，质量控制QC负责检验。"
    points = ["质量保证QA：负责质量体系", "无菌保证水平：完全无关的要点"]
    cov = M.literal_point_coverage(answer, points)
    assert cov == pytest.approx(0.5)   # 第一个键短语命中，第二个未命中


def test_literal_point_coverage_empty_points_is_none():
    assert M.literal_point_coverage("任意", []) is None


# ── §13.10 分位数（Hyndman–Fan Type 7）────────────────────────────────────────
def test_percentile_hf7_median():
    assert M.percentile_hf7([1, 2, 3, 4], 50) == pytest.approx(2.5)
    assert M.percentile_hf7([1, 2, 3], 50) == pytest.approx(2.0)


def test_percentile_hf7_matches_numpy():
    import numpy as np
    xs = [3.0, 1.0, 4.0, 1.5, 5.0, 9.0, 2.0]
    for p in (50, 90, 95):
        assert M.percentile_hf7(xs, p) == pytest.approx(
            float(np.percentile(xs, p, method="linear")))


def test_percentile_hf7_empty_is_none():
    assert M.percentile_hf7([], 50) is None


# ── §16 McNemar exact & 配对 bootstrap ───────────────────────────────────────
def test_mcnemar_exact_no_discordant_is_one():
    assert M.mcnemar_exact(0, 0) == pytest.approx(1.0)


def test_mcnemar_exact_symmetric_is_one():
    assert M.mcnemar_exact(5, 5) == pytest.approx(1.0)


def test_mcnemar_exact_extreme_is_small():
    assert M.mcnemar_exact(10, 0) < 0.01


def test_paired_bootstrap_ci_constant():
    lo, hi = M.paired_bootstrap_ci([2.0, 2.0, 2.0], iters=1000, seed=0)
    assert lo == pytest.approx(2.0) and hi == pytest.approx(2.0)


def test_paired_bootstrap_ci_deterministic_and_brackets_mean():
    diffs = [0.1, -0.2, 0.3, 0.0, 0.5, -0.1]
    lo1, hi1 = M.paired_bootstrap_ci(diffs, iters=2000, seed=42)
    lo2, hi2 = M.paired_bootstrap_ci(diffs, iters=2000, seed=42)
    assert (lo1, hi1) == (lo2, hi2)          # 固定种子可复现
    assert lo1 <= sum(diffs) / len(diffs) <= hi1


def test_paired_bootstrap_ci_empty_is_none():
    assert M.paired_bootstrap_ci([], iters=100, seed=0) == (None, None)


# ── §13.2 引用格式完整率 ─────────────────────────────────────────────────────
def test_citation_format_valid_rate():
    good = "【条款编号】第一条\n【来源】GMP\n【原文内容】正文"
    bad = "【条款编号】第二条\n【来源】\n【原文内容】正文"   # 来源缺失
    assert M.citation_format_valid_rate(good + "\n\n" + bad) == pytest.approx(0.5)
    assert M.citation_format_valid_rate("无引用块") is None


def test_citation_format_rate_counts_incomplete_marker_attempts():
    good = "【条款编号】第一条\n【来源】GMP\n【原文内容】正文"
    missing_content_marker = "【条款编号】第二条\n【来源】GMP\n正文"

    assert M.citation_format_valid_rate(
        good + "\n\n" + missing_content_marker) == pytest.approx(0.5)
    assert M.citation_format_valid_rate(missing_content_marker) == pytest.approx(0.0)


# ── harness 纯/半纯辅助（不访真实 LLM）─────────────────────────────────────
from eval import critic_ablation as A  # noqa: E402
import re as _re  # noqa: E402


def test_utc_stamp_format():
    assert _re.fullmatch(r"\d{8}T\d{6}Z", A.utc_stamp())


def test_make_results_dir_collision(tmp_path, monkeypatch):
    monkeypatch.setattr(A, "RESULTS_ROOT", tmp_path / "res")
    d = A.make_results_dir("deadbeef", stamp="20260101T000000Z")
    assert d.exists()
    with pytest.raises(FileExistsError):
        A.make_results_dir("deadbeef", stamp="20260101T000000Z")


def test_config_snapshot_has_required_keys():
    snap = A.build_config_snapshot()
    for k in ("LLM_MODEL", "COVE_ENABLED", "MAX_REASONING_STEPS", "RAG_TOP_K",
              "SEMANTIC_CACHE_ENABLED", "EMB_DIM"):
        assert k in snap
    assert set(snap["route_model"]) == {"generate", "critique", "revise"}


def test_git_snapshot_structure():
    snap = A.build_git_snapshot()
    assert "head" in snap and "source_file_sha256" in snap
    # 本 harness 自身的源文件哈希必须在快照里
    assert snap["source_file_sha256"].get("eval/critic_ablation.py")


# ── 可观测 LLM 客户端 & A/B/C 编排（stub LLM，不联网）─────────────────────
import agents.tutor as T  # noqa: E402


def _resp(content, usage={"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}):
    r = {"choices": [{"message": {"content": content}}]}
    if usage is not None:
        r["usage"] = usage
    return r


def _stub_post(reply_by_type):
    """返回一个 post_fn：按分类结果回不同内容，并计数物理调用。"""
    calls = {"n": 0}

    def post(body):
        calls["n"] += 1
        ctype = A.classify_call(body["messages"], body["temperature"])
        content, usage = reply_by_type.get(ctype, ("PASS", None))
        return _resp(content, usage)
    post.calls = calls
    return post


def test_classify_call_by_signature():
    gen = [{"role": "system", "content": "你是GMP法规检索助手，..."},
           {"role": "user", "content": "参考资料：xxx\n\n学生问题：什么是QA"}]
    critic = [{"role": "user", "content": "你是GMP法规审核专家。...请只回复：PASS"}]
    cove = [{"role": "user", "content": "你是GMP法规验证专家。...只回复：VERIFIED"}]
    revise = [{"role": "user", "content": "原答案存在以下问题：X\n请修正原答案..."}]
    assert A.classify_call(gen, 0.3) == "generate"
    assert A.classify_call(critic, 0.1) == "critic_standard"
    assert A.classify_call(cove, 0.1) == "critic_cove"
    assert A.classify_call(revise, 0.3) == "revise"


def test_client_captures_usage_and_absence():
    client = A.ObservableLLMClient(post_fn=_stub_post({
        "critic_standard": ("PASS", {"prompt_tokens": 3, "completion_tokens": 1, "total_tokens": 4})}))
    client(["dummy"], temperature=0.1, model="m") if False else None
    out = client([{"role": "user", "content": "你是GMP法规审核专家 PASS"}], temperature=0.1)
    assert out == "PASS"
    rec = client.calls[-1]
    assert rec["usage_available"] is True
    assert rec["usage"]["total_tokens"] == 4
    assert rec["call_id"]
    # usage 缺失时明确标 False
    client2 = A.ObservableLLMClient(post_fn=_stub_post({
        "critic_standard": ("PASS", None)}))
    client2([{"role": "user", "content": "你是GMP法规审核专家 PASS"}], temperature=0.1)
    assert client2.calls[-1]["usage_available"] is False


def test_client_replay_dedup_same_request():
    post = _stub_post({"critic_standard": ("PASS", None)})
    client = A.ObservableLLMClient(post_fn=post)
    msgs = [{"role": "user", "content": "你是GMP法规审核专家 PASS"}]
    client(msgs, temperature=0.1, model="m")
    client(msgs, temperature=0.1, model="m")   # 完全相同 → replay
    assert post.calls["n"] == 1                # 只一次物理调用
    assert client.calls[0]["execution_mode"] == "live"
    assert client.calls[1]["execution_mode"] == "replay"
    assert client.calls[1]["replay_of"] == client.calls[0]["call_id"]


_DOCS = [
    {"id": "REG-GMP2010-A001", "doc_type": "regulation", "title": "一", "content": "内容A", "score": 0.9},
    {"id": "KP-BK-001", "doc_type": "kp", "title": "kp", "content": "知识点", "score": 0.5},
]


def test_arm_A_makes_no_llm_calls():
    client = A.ObservableLLMClient(post_fn=_stub_post({}))
    res = A.run_arm_A("这是共享初稿")
    assert res["final_answer"] == "这是共享初稿"
    assert res["arm"] == "A"
    assert len(client.calls) == 0


def test_arm_B_critic_pass_no_cove_and_config_restored(monkeypatch):
    monkeypatch.setattr(T, "COVE_ENABLED", True)          # 生产默认 True
    client = A.ObservableLLMClient(post_fn=_stub_post({
        "critic_standard": ("PASS", None)}))
    monkeypatch.setattr(T, "_llm_chat", client)
    res, trace = A.run_arm(draft="初稿", docs=_DOCS, cove_enabled=False, arm_name="B")
    types = [c["call_type"] for c in client.calls]
    assert "critic_cove" not in types          # §20：B 组 CoVe 调用必须为 0
    assert types.count("critic_standard") == 1
    assert res["revisions"] == 0
    assert T.COVE_ENABLED is True              # 退出后配置恢复


def test_arm_C_cove_runs_after_critic_pass(monkeypatch):
    monkeypatch.setattr(T, "COVE_ENABLED", False)
    client = A.ObservableLLMClient(post_fn=_stub_post({
        "critic_standard": ("PASS", None), "critic_cove": ("VERIFIED", None)}))
    monkeypatch.setattr(T, "_llm_chat", client)
    res, trace = A.run_arm(draft="初稿", docs=_DOCS, cove_enabled=True, arm_name="C")
    types = [c["call_type"] for c in client.calls]
    assert types == ["critic_standard", "critic_cove"]   # 普通 Critic 通过后才 CoVe
    assert res["revisions"] == 0
    assert T.COVE_ENABLED is False             # 恢复


def test_arm_B_revise_loop_then_degrade(monkeypatch):
    # critic 永远报问题 → 进入 revise，直到预算耗尽 → 降级提示
    monkeypatch.setattr(T, "COVE_ENABLED", True)
    client = A.ObservableLLMClient(post_fn=_stub_post({
        "critic_standard": ("答案与法规矛盾", None),
        "revise": ("修订稿", None)}))
    monkeypatch.setattr(T, "_llm_chat", client)
    res, trace = A.run_arm(draft="初稿", docs=_DOCS, cove_enabled=False, arm_name="B")
    from config import MAX_REASONING_STEPS
    assert res["revisions"] == MAX_REASONING_STEPS       # 预算耗尽
    assert res["degraded"] is True
    assert T._DEGRADE_NOTICE.strip()[:6] in res["final_answer"]


def test_run_experiment_refuses_without_confirm_paid(capsys):
    # 未确认付费 → 必须拒绝且不产生任何调用
    rc = A.run_experiment("eval/golden_set.jsonl", "pilot", confirm_paid=False)
    assert rc == 3
    assert "confirm-paid" in capsys.readouterr().out


def test_run_experiment_marks_partial_and_returns_nonzero_on_question_error(tmp_path, monkeypatch):
    """单题失败必须保留错误，且运行状态不能伪装成 complete。"""
    records = [{"id": "EQ-001"}, {"id": "EQ-002"}]
    info = {
        "records": records, "raw": b"", "dataset_sha": "dataset-sha",
        "contract_violations": [], "kb_fp": {}, "anchors": {},
        "git_snap": {"head_short": "test"}, "cfg_snap": {},
        "problems": [], "passed": True, "dataset": "synthetic.jsonl",
    }
    monkeypatch.setattr(A, "_collect_preflight", lambda dataset: info)
    results_root = tmp_path / "results"
    monkeypatch.setattr(A, "RESULTS_ROOT", results_root)
    monkeypatch.setattr(A, "utc_stamp", lambda: "20260101T000000Z")
    monkeypatch.setitem(sys.modules, "rag.vector_index", SimpleNamespace(rebuild=lambda: None))

    def fake_run_one_question(record, client):
        if record["id"] == "EQ-002":
            raise RuntimeError("synthetic question failure")
        return {
            "id": record["id"], "retrieval_snapshot": [],
            "generation": {"id": record["id"]},
            "arms": {arm: {"arm": arm, "revisions": 0} for arm in ("A", "B", "C")},
            "critic_trace": [],
        }

    monkeypatch.setattr(A, "run_one_question", fake_run_one_question)

    rc = A.run_experiment("synthetic.jsonl", "full", confirm_paid=True)

    assert rc != 0
    result_dir = results_root / "20260101T000000Z_test"
    manifest = json.loads((result_dir / "manifest.json").read_text(encoding="utf-8"))
    summary = json.loads((result_dir / "summary.json").read_text(encoding="utf-8"))
    assert manifest["status"] == "partial"
    assert manifest["status"] != "complete"
    assert manifest["n_errors"] == 1
    assert summary["errors"][0]["id"] == "EQ-002"


def test_judge_prompts_are_blind():
    cov = A.build_coverage_prompt("问题Q", "答案文本", ["要点1", "要点2"])
    ff = A.build_faithfulness_prompt("问题Q", "答案文本", ["证据1", "证据2"])
    for p in (cov, ff):
        for leak in ("组A", "组B", "组C", "Critic", "critic", "修订", "revise", "CoVe"):
            assert leak not in p
    assert "要点1" in cov and "问题Q" in cov
    assert "证据1" in ff


def test_parse_coverage_scores():
    reply = '```json\n{"points":[{"i":1,"verdict":"covered"},{"i":2,"verdict":"partial"},{"i":3,"verdict":"missing"}]}\n```'
    score, verdicts = A.parse_coverage(reply, 3)
    assert score == pytest.approx((1 + 0.5 + 0) / 3)
    assert verdicts == ["covered", "partial", "missing"]


def test_parse_coverage_bad_output_is_none():
    assert A.parse_coverage("模型胡言乱语没有JSON", 3) == (None, None)


def test_parse_faithfulness_score():
    reply = '{"n_claims": 4, "n_supported": 3, "faithfulness": 0.75}'
    score, detail = A.parse_faithfulness(reply)
    assert score == pytest.approx(0.75)
    assert detail["n_claims"] == 4


def test_collect_unique_answers_dedups_bc_and_ab():
    arms = {
        "EQ-1": {"A": {"final_answer": "same", "final_sha256": M.sha256_text("same")},
                 "B": {"final_answer": "same", "final_sha256": M.sha256_text("same")},
                 "C": {"final_answer": "same", "final_sha256": M.sha256_text("same")}},
        "EQ-2": {"A": {"final_answer": "aa", "final_sha256": M.sha256_text("aa")},
                 "B": {"final_answer": "bb", "final_sha256": M.sha256_text("bb")},
                 "C": {"final_answer": "bb", "final_sha256": M.sha256_text("bb")}},
    }
    uniq = A.collect_unique_answers(arms)
    # EQ-1: 1 unique(A=B=C)；EQ-2: 2 unique(A, B=C) → 共 3
    assert len(uniq) == 3
    # 每个 unique 记录它对应哪些 (qid, arm)
    bykey = {(u["qid"], u["answer_sha256"]): u for u in uniq}
    eq1 = [u for u in uniq if u["qid"] == "EQ-1"][0]
    assert set(eq1["arms"]) == {"A", "B", "C"}


def test_run_one_question_shared_draft_and_b_no_cove(monkeypatch):
    monkeypatch.setattr(T, "COVE_ENABLED", True)
    client = A.ObservableLLMClient(post_fn=_stub_post({
        "critic_standard": ("PASS", None), "critic_cove": ("VERIFIED", None)}))
    monkeypatch.setattr(T, "_llm_chat", client)
    # 冻结检索与共享 Generate 用桩替换（避免联网/建索引）；arms 仍真跑（走 replay）
    monkeypatch.setattr(A, "freeze_retrieval",
                        lambda q, edu=None: (_DOCS, [{"rank": 1, **_DOCS[0]}]))
    monkeypatch.setattr(A, "shared_generate", lambda q, edu, docs, cl: ("共享初稿", ["ctx"]))
    rec = {"id": "EQ-002", "question": "问题", "edu_level": None}
    out = A.run_one_question(rec, client)
    sha = out["arms"]["A"]["initial_draft_sha256"]
    assert out["arms"]["B"]["initial_draft_sha256"] == sha
    assert out["arms"]["C"]["initial_draft_sha256"] == sha
    # B 组无 cove；C 的 critic 与 B 相同 → replay，C 另有一次 cove(live)
    b_types = [client.calls[i]["call_type"]
               for i, cid in enumerate(c["call_id"] for c in client.calls)
               if cid in out["call_ids"]["B"]]
    assert "critic_cove" not in b_types
    assert any(x["call_type"] == "critic_cove" for x in client.calls)


# ── Task 7（05 §11）：独立修复评测入口 ─────────────────────────────────────
from eval import critic_repair_eval as RE  # noqa: E402
import agents.tutor as _T  # noqa: E402

_SRC_RUN = "eval/results/critic_ablation/20260903T183842Z_71d95591"


def _src_is_recoverable():
    path = A.GMP_API_DIR / _SRC_RUN
    if not path.exists():
        return False
    try:
        return bool(RE.recover_source(str(path))["records"])
    except (OSError, ValueError, KeyError, json.JSONDecodeError):
        return False


_SRC_RUN_RECOVERABLE = _src_is_recoverable()


@pytest.mark.skipif(not _SRC_RUN_RECOVERABLE, reason="source-run 不存在或不满足当前恢复契约")
def test_repair_eval_reuses_source_draft_and_evidence():
    rec = RE.recover_source(str(A.GMP_API_DIR / _SRC_RUN))
    assert rec["records"], "应能恢复至少一题"
    # 复用的初稿必须与 source generation 的 draft 一致，且证据可重建
    gen = {g["id"]: g for g in A._load_jsonl(A.GMP_API_DIR / _SRC_RUN / "generation.jsonl")}
    qid = next(iter(rec["records"]))
    assert rec["records"][qid]["initial_draft"] == gen[qid]["draft"]
    assert rec["records"][qid]["evidence"]["context_sha256"]


def test_cross_arm_replay_is_labeled():
    posts = {"n": 0}

    def post(body):
        posts["n"] += 1
        return {"choices": [{"message": {"content": "R"}}], "usage": {"total_tokens": 1}}
    c = RE.RepairClient(post_fn=post)
    msgs = [{"role": "user", "content": "同一请求内容"}]
    c.current_qid, c.current_arm = "EQ-1", "legacy"
    c(msgs, temperature=0.1, model="m")
    c.current_arm = "v2"                       # 换组，相同请求 → 跨组 replay
    c(msgs, temperature=0.1, model="m")
    assert posts["n"] == 1
    assert c.calls[1]["execution_mode"] == "replay"
    assert c.calls[1]["replay_reason"] == "cross_arm_pairing"


def test_within_arm_duplicate_request_is_contract_failure():
    c = RE.RepairClient(post_fn=lambda b: {"choices": [{"message": {"content": "R"}}]})
    msgs = [{"role": "user", "content": "重复请求"}]
    c.current_qid, c.current_arm = "EQ-1", "v2"
    c(msgs, temperature=0.1, model="m")
    with pytest.raises(RE.WithinArmDuplicateError):
        c(msgs, temperature=0.1, model="m")    # 同组相同请求 → 契约失败


@pytest.mark.skipif(not _SRC_RUN_RECOVERABLE, reason="source-run 不存在或不满足当前恢复契约")
def test_retrieval_snapshot_keeps_qid(tmp_path, monkeypatch):
    # 修复评测写出的 evidence_snapshot 每行必须含 qid（§11.5）
    monkeypatch.setattr(RE, "RESULTS_ROOT", tmp_path / "rr")
    rec = RE.recover_source(str(A.GMP_API_DIR / _SRC_RUN))
    qid = next(iter(rec["records"]))
    RE.run_repair(str(A.GMP_API_DIR / _SRC_RUN), ["v2"], [qid], preflight_only=False,
                  confirm_paid=True, post_fn=lambda b: {"choices": [{"message": {"content": '{"passed":true,"issues":[]}' if "审核专家" in b["messages"][0]["content"] else "VERIFIED"}}]})
    out = list((tmp_path / "rr").glob("*/evidence_snapshot.jsonl"))
    assert out, "应生成 evidence_snapshot"
    rows = A._load_jsonl(out[0])
    assert rows and all("qid" in r for r in rows)


@pytest.mark.skipif(not _SRC_RUN_RECOVERABLE, reason="source-run 不存在或不满足当前恢复契约")
def test_candidate_trace_is_complete(tmp_path, monkeypatch):
    monkeypatch.setattr(RE, "RESULTS_ROOT", tmp_path / "rr")
    rec = RE.recover_source(str(A.GMP_API_DIR / _SRC_RUN))
    qid = next(iter(rec["records"]))

    def post(b):
        return {"choices": [{"message": {"content": '{"passed":true,"issues":[]}' if "审核专家" in b["messages"][0]["content"] else "VERIFIED"}}]}
    RE.run_repair(str(A.GMP_API_DIR / _SRC_RUN), ["v2"], [qid], preflight_only=False,
                  confirm_paid=True, post_fn=post)
    ct = list((tmp_path / "rr").glob("*/candidate_trace.jsonl"))[0]
    rows = A._load_jsonl(ct)
    need = {"id", "mode", "round", "draft_sha256", "context_sha256",
            "issue_signature", "candidate_score", "selected_as_best", "termination_reason"}
    assert rows and need <= set(rows[0])


@pytest.mark.skipif(not _SRC_RUN_RECOVERABLE, reason="source-run 不存在或不满足当前恢复契约")
def test_source_run_is_never_modified(tmp_path, monkeypatch):
    src = A.GMP_API_DIR / _SRC_RUN
    before = {p.name: A.M.sha256_bytes(p.read_bytes()) for p in src.glob("*.jsonl")}
    monkeypatch.setattr(RE, "RESULTS_ROOT", tmp_path / "rr")
    rec = RE.recover_source(str(src))
    qid = next(iter(rec["records"]))
    RE.run_repair(str(src), ["v2"], [qid], preflight_only=False, confirm_paid=True,
                  post_fn=lambda b: {"choices": [{"message": {"content": '{"passed":true,"issues":[]}' if "审核专家" in b["messages"][0]["content"] else "VERIFIED"}}]})
    after = {p.name: A.M.sha256_bytes(p.read_bytes()) for p in src.glob("*.jsonl")}
    assert before == after                     # source-run 原始产物哈希不变
