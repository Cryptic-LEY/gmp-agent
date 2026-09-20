# -*- coding: utf-8 -*-
"""Critic / CoVe / Revise 最小真实消融实验 harness。

对应规格 specs/agent-validation/04-critic-cove-ablation.md。
本文件负责：预检、冻结检索、共享 Generate、运行 A/B/C、记录调用与原始结果、生成 manifest。
确定性指标与解析在 eval/critic_metrics.py。

命令接口（§22）——注意实际解释器为项目 .venv（Python 3.14），规格中的 py -3.11 为笔误：
  python -m eval.critic_ablation --dataset eval/golden_set.jsonl --preflight-only
  python -m eval.critic_ablation --dataset eval/golden_set.jsonl --mode pilot --confirm-paid
  python -m eval.critic_ablation --dataset eval/golden_set.jsonl --mode full  --confirm-paid

本阶段：preflight 完整落地（无付费）；pilot/full 的 A/B/C 分支与可观测客户端后续接入。
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from eval import critic_metrics as M

# ── 路径 ─────────────────────────────────────────────────────────────────────
GMP_API_DIR = Path(__file__).resolve().parent.parent          # .../gmp-api
REPO_ROOT = GMP_API_DIR.parent                                # .../gmp-agent
RESULTS_ROOT = GMP_API_DIR / "eval" / "results" / "critic_ablation"
DEFAULT_DATASET = "eval/golden_set.jsonl"

# §8.1 需要指纹的源文件（工作树未提交也能靠哈希追溯）
_SNAPSHOT_SRC = [
    "agents/tutor.py",
    "config.py",
    "rag/retriever.py",
    "rag/vector_index.py",
    "eval/ragas_eval.py",
    "eval/critic_ablation.py",
    "eval/critic_metrics.py",
]


# ── 工具 ─────────────────────────────────────────────────────────────────────
def utc_stamp() -> str:
    """§11 目录时间戳：YYYYMMDDTHHMMSSZ。"""
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _git(*args: str) -> str:
    try:
        return subprocess.run(
            ["git", "-C", str(REPO_ROOT), *args],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=15,
        ).stdout.strip()
    except Exception as e:  # noqa: BLE001
        return f"<git error: {e}>"


def load_dataset(rel_or_abs: str) -> tuple[list[dict], bytes]:
    """载入金标 jsonl，返回 (records, 原始字节)。路径相对 gmp-api 目录解析。"""
    p = Path(rel_or_abs)
    if not p.is_absolute():
        p = GMP_API_DIR / rel_or_abs
    raw = p.read_bytes()
    records = [json.loads(line) for line in raw.decode("utf-8").splitlines() if line.strip()]
    return records, raw


# ── §8.1 代码状态快照 ────────────────────────────────────────────────────────
def build_git_snapshot() -> dict:
    files = {}
    for rel in _SNAPSHOT_SRC:
        fp = GMP_API_DIR / rel
        files[rel] = M.sha256_bytes(fp.read_bytes()) if fp.exists() else None
    return {
        "head": _git("rev-parse", "HEAD"),
        "head_short": _git("rev-parse", "--short=8", "HEAD"),
        "branch": _git("rev-parse", "--abbrev-ref", "HEAD"),
        "status_porcelain": _git("status", "--porcelain"),
        "tracked_diff_sha256": M.sha256_text(_git("diff")),
        "source_file_sha256": files,
        "python_version": sys.version.split()[0],
        "python_executable": sys.executable,
    }


# ── §8.2 配置快照 ────────────────────────────────────────────────────────────
_CONFIG_KEYS = [
    "LLM_MODEL", "LLM_MODEL_HEAVY", "LLM_MODEL_SMALL", "LLM_ENABLE_THINKING",
    "COVE_ENABLED", "MAX_REASONING_STEPS", "TUTOR_REPAIR_V2_ENABLED",
    "TUTOR_REPAIR_MAX_REVISIONS", "TUTOR_REPAIR_MIN_CONFIDENCE",
    "TUTOR_REPAIR_MAX_REPEAT_ISSUES",
    "RAG_TOP_K", "RAG_GRAPH_HOP", "RAG_THRESHOLD", "RAG_GRAPH_THRESHOLD",
    "RAG_FINAL_TOP_N", "RAG_RERANK_ENABLED", "RAG_RERANK_MODEL", "RAG_RERANK_TOP_BEFORE",
    "RAG_FUSION_VEC_WEIGHT", "RAG_FUSION_BM25_WEIGHT", "RAG_HYDE_ENABLED",
    "CTX_COMPRESS_ENABLED", "CTX_COMPRESS_RATIO", "SEMANTIC_CACHE_ENABLED",
    "MEMORY_ENABLED", "HISTORY_TURNS", "EVAL_GOLDEN_PATH", "EMB_MODEL", "EMB_DIM",
]


def build_config_snapshot() -> dict:
    import config
    snap = {k: getattr(config, k, None) for k in _CONFIG_KEYS}
    # 阶段模型路由（§12 计价需要）
    from agents.router import route_model
    snap["route_model"] = {t: route_model(t) for t in ("generate", "critique", "revise")}
    return snap


# ── §8.3 知识库与索引指纹 ────────────────────────────────────────────────────
def build_kb_index_fingerprint() -> tuple[dict, object]:
    """返回 (指纹 dict, 已构建的 VectorIndex)。会连库 + rebuild 索引（无付费 LLM）。"""
    from rag.resources import get_db_connection
    import rag.vector_index as vi
    import config

    fp: dict = {
        "mysql": {"host": config.MYSQL_HOST, "port": config.MYSQL_PORT,
                  "database": config.MYSQL_DATABASE},
        "tables": {},
    }
    with get_db_connection() as conn:
        cur = conn.cursor()
        for t in ("reg_library", "knowledge_points", "kp_reg_links", "reg_chunks"):
            cur.execute(f"SELECT COUNT(*) FROM {t}")
            fp["tables"][t] = cur.fetchone()[0]
        cur.execute("SELECT reg_id FROM reg_library ORDER BY reg_id")
        reg_ids = [r[0] for r in cur.fetchall()]
        cur.execute("SELECT kp_id FROM knowledge_points ORDER BY kp_id")
        kp_ids = [r[0] for r in cur.fetchall()]

    fp["reg_id_set_sha256"] = M.sha256_text("\n".join(reg_ids))
    fp["kp_id_set_sha256"] = M.sha256_text("\n".join(kp_ids))

    idx = vi.rebuild()
    fp["vector_index"] = {
        "size": idx.size,
        "emb_model": config.EMB_MODEL,
        "emb_dim": config.EMB_DIM,
        "hnsw_space": "cosine",
        "hnsw_M": vi._HNSW_M,
        "hnsw_ef_construction": vi._HNSW_EF_CONSTRUCTION,
        "hnsw_ef_search": vi._HNSW_EF_SEARCH,
        "rerank_model": config.RAG_RERANK_MODEL,
        "rerank_enabled": config.RAG_RERANK_ENABLED,
        "rerank_top_before": config.RAG_RERANK_TOP_BEFORE,
    }
    return fp, idx


# ── §7.6 锚定 id 存在性 ──────────────────────────────────────────────────────
def check_anchor_ids_exist(records: list[dict]) -> dict:
    """核对每个 expect_reg_ids/kp_ids 是否存在于 MySQL。返回缺失清单。"""
    from rag.resources import get_db_connection
    want_reg, want_kp = set(), set()
    for r in records:
        want_reg.update(r.get("expect_reg_ids") or [])
        want_kp.update(r.get("expect_kp_ids") or [])
    with get_db_connection() as conn:
        cur = conn.cursor()
        have_reg, have_kp = set(), set()
        if want_reg:
            fmt = ",".join(["%s"] * len(want_reg))
            cur.execute(f"SELECT reg_id FROM reg_library WHERE reg_id IN ({fmt})", tuple(want_reg))
            have_reg = {r[0] for r in cur.fetchall()}
        if want_kp:
            fmt = ",".join(["%s"] * len(want_kp))
            cur.execute(f"SELECT kp_id FROM knowledge_points WHERE kp_id IN ({fmt})", tuple(want_kp))
            have_kp = {r[0] for r in cur.fetchall()}
    return {
        "n_reg_anchors": len(want_reg), "n_kp_anchors": len(want_kp),
        "missing_reg": sorted(want_reg - have_reg),
        "missing_kp": sorted(want_kp - have_kp),
    }


# ── 结果目录 & manifest ──────────────────────────────────────────────────────
def make_results_dir(git_short: str, stamp: str | None = None) -> Path:
    """§11：创建唯一结果目录；已存在则报错（§20 禁止覆盖/续写）。"""
    stamp = stamp or utc_stamp()
    d = RESULTS_ROOT / f"{stamp}_{git_short}"
    if d.exists():
        raise FileExistsError(f"结果目录已存在，拒绝覆盖：{d}")
    d.mkdir(parents=True, exist_ok=False)
    return d


def write_json(path: Path, obj: dict) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
            f.flush()


# ── 预检主流程 ───────────────────────────────────────────────────────────────
def _collect_preflight(dataset: str) -> dict:
    """执行全部预检检查（无付费、无副作用建目录）；返回信息 dict，供 --preflight-only
    与 run_experiment 共用。这样运行链路只建一个结果目录，避免同秒时间戳撞车。"""
    print("=" * 64)
    print("  critic_ablation 预检（无付费 LLM 调用）")
    print("=" * 64)
    problems: list[str] = []

    # 1) 数据集契约（schema）
    records, raw = load_dataset(dataset)
    dataset_sha = M.sha256_bytes(raw)
    contract_violations = M.validate_dataset(records)
    problems += [f"[数据契约] {v}" for v in contract_violations]
    print(f"  数据集：{dataset}  n={len(records)}  sha256={dataset_sha[:16]}…  "
          f"契约违规={len(contract_violations)}")

    # 2) MySQL SELECT 1 + 表行数 + 索引指纹（含 rebuild）
    try:
        from rag.resources import get_db_connection
        with get_db_connection() as conn:
            conn.cursor().execute("SELECT 1")
        kb_fp, _idx = build_kb_index_fingerprint()
        idx_size = kb_fp["vector_index"]["size"]
        print(f"  MySQL：OK  表行数={kb_fp['tables']}")
        print(f"  向量索引：size={idx_size}")
        if idx_size <= 0:
            problems.append("[索引] 向量索引条目数为 0（检索将降级为关键词，违反 §6.2/§20）")
    except Exception as e:  # noqa: BLE001
        problems.append(f"[环境] MySQL/索引不可用：{e!r}")
        kb_fp = {"error": repr(e)}

    # 3) 锚定 id 存在性（§7.6）
    try:
        anchors = check_anchor_ids_exist(records)
        if anchors["missing_reg"]:
            problems.append(f"[锚定] {len(anchors['missing_reg'])} 个法规锚定不在库：{anchors['missing_reg'][:5]}")
        if anchors["missing_kp"]:
            problems.append(f"[锚定] {len(anchors['missing_kp'])} 个知识点锚定不在库：{anchors['missing_kp'][:5]}")
        print(f"  锚定存在性：reg {anchors['n_reg_anchors']} 个（缺 {len(anchors['missing_reg'])}）/ "
              f"kp {anchors['n_kp_anchors']} 个（缺 {len(anchors['missing_kp'])}）")
    except Exception as e:  # noqa: BLE001
        problems.append(f"[锚定] 存在性检查失败：{e!r}")
        anchors = {"error": repr(e)}

    # 4) 快照
    git_snap = build_git_snapshot()
    cfg_snap = build_config_snapshot()

    passed = not problems
    print("-" * 64)
    if passed:
        print("  预检 PASS ✔")
    else:
        print(f"  预检 FAIL：共 {len(problems)} 项问题：")
        for p in problems:
            print("   -", p)
    return {
        "records": records, "raw": raw, "dataset_sha": dataset_sha,
        "contract_violations": contract_violations, "kb_fp": kb_fp,
        "anchors": anchors, "git_snap": git_snap, "cfg_snap": cfg_snap,
        "problems": problems, "passed": passed, "dataset": dataset,
    }


def _preflight_manifest(kind: str, info: dict, status: str) -> dict:
    return {
        "kind": kind, "status": status,
        "local_time": datetime.now().isoformat(timespec="seconds"),
        "utc_time": utc_stamp(),
        "dataset": {"path": info["dataset"], "n": len(info["records"]),
                    "sha256": info["dataset_sha"]},
        "git": info["git_snap"], "config": info["cfg_snap"],
        "kb_index": info["kb_fp"], "anchors": info["anchors"],
        "contract_violations": info["contract_violations"],
        "problems": info["problems"], "passed": info["passed"],
    }


def preflight(dataset: str = DEFAULT_DATASET) -> dict:
    """§17/§22 --preflight-only：无付费调用，校验并落盘 manifest 到独立目录。"""
    info = _collect_preflight(dataset)
    results_dir = make_results_dir(info["git_snap"].get("head_short") or "nogit")
    write_jsonl(results_dir / "dataset_snapshot.jsonl", info["records"])
    manifest = _preflight_manifest("critic_ablation_preflight", info,
                                   "complete" if info["passed"] else "failed")
    write_json(results_dir / "manifest.json", manifest)
    print(f"  结果目录：{results_dir.resolve()}")
    return {"passed": info["passed"], "problems": info["problems"],
            "results_dir": str(results_dir.resolve()), "manifest": manifest}


# ── §12 调用分类（按 prompt 签名，参数无法区分 generate/revise、critic/cove）────
def classify_call(messages: list[dict], temperature: float) -> str:
    text = "\n".join((m.get("content") or "") for m in messages)
    if "GMP法规验证专家" in text or "VERIFIED" in text:
        return "critic_cove"
    if "GMP法规审核专家" in text:
        return "critic_standard"
    if "原答案存在以下问题" in text:
        return "revise"
    if "GMP法规检索助手" in text or "学生问题：" in text:
        return "generate"
    return "unknown"


# ── §6.4 / §10 可观测 LLM 客户端 ─────────────────────────────────────────────
class ObservableLLMClient:
    """替换 agents.tutor._llm_chat：发送与生产相同的请求体，额外保存原始响应/usage/耗时。

    - 请求 SHA 去重：相同 {model,messages,temperature,enable_thinking} 只物理调用一次，
      后续 replay 复用首次响应，并按原 usage/耗时计入逻辑口径（§6.4）。
    - 调用分类：按 prompt 签名（§12）。
    - post_fn 可注入（测试用），默认走真实 httpx（付费）。
    """

    def __init__(self, post_fn=None):
        self._post = post_fn or self._real_post
        self.calls: list[dict] = []
        self._replay: dict[str, dict] = {}
        self.current_stage: str | None = None

    def _real_post(self, body: dict) -> dict:
        import httpx
        from config import LLM_BASE_URL, LLM_API_KEY
        resp = httpx.post(
            f"{LLM_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {LLM_API_KEY}"},
            json=body, timeout=120,
        )
        resp.raise_for_status()
        return resp.json()

    @staticmethod
    def _req_sha(body: dict) -> str:
        return M.sha256_text(json.dumps(body, ensure_ascii=False, sort_keys=True))

    def __call__(self, messages: list[dict], temperature: float = 0.3,
                 model: str | None = None) -> str:
        from config import LLM_MODEL, LLM_ENABLE_THINKING
        body: dict = {"model": model or LLM_MODEL, "messages": messages, "temperature": temperature}
        if LLM_ENABLE_THINKING:
            body["enable_thinking"] = True
        req_sha = self._req_sha(body)
        call_type = classify_call(messages, temperature)
        call_id = f"call_{len(self.calls) + 1:04d}"

        if req_sha in self._replay:
            prev = self._replay[req_sha]
            content, usage, latency = prev["content"], prev["usage"], prev["latency_ms"]
            mode, replay_of, raw = "replay", prev["call_id"], None
        else:
            t0 = time.monotonic()
            resp = self._post(body)
            latency = max(0, int((time.monotonic() - t0) * 1000))
            content = resp["choices"][0]["message"]["content"]
            usage = resp.get("usage")
            mode, replay_of, raw = "live", None, resp
            self._replay[req_sha] = {"content": content, "usage": usage,
                                     "latency_ms": latency, "call_id": call_id}

        self.calls.append({
            "call_id": call_id, "call_type": call_type, "stage_tag": self.current_stage,
            "model": body["model"], "temperature": temperature,
            "enable_thinking": body.get("enable_thinking", False),
            "messages": messages,
            "usage": usage, "usage_available": usage is not None,
            "latency_ms": latency, "execution_mode": mode, "replay_of": replay_of,
            "request_sha256": req_sha,
            "raw_response": raw,   # 仅 live 保存
        })
        return content


# ── A/B/C 分支 ───────────────────────────────────────────────────────────────
def run_arm_A(draft: str) -> dict:
    """A：Generate Only——最终答案就是共享初稿，不做任何后处理（0 次 LLM 调用）。"""
    sha = M.sha256_text(draft)
    return {"arm": "A", "final_answer": draft, "final_sha256": sha,
            "initial_draft_sha256": sha, "revisions": 0, "degraded": False,
            "terminated_reason": "generate_only"}


def run_arm(draft: str, docs: list[dict], *, cove_enabled: bool, arm_name: str) -> tuple[dict, list[dict]]:
    """B/C：在共享初稿上跑 critique→(revise→critique)* 循环（镜像生产图 + early_stop）。

    cove_enabled 控制 agents.tutor.COVE_ENABLED（退出后必复原，§5/§20）。
    reg_context / retrieved_ids 的构造与生产 node_critique 完全一致。
    """
    import agents.tutor as T
    from agents.limits import early_stop

    reg_docs = [d for d in docs if d.get("doc_type") == "regulation"]
    reg_context = "\n".join(f"【{d['id']}】{d['content']}" for d in reg_docs[:5])
    retrieved_ids = {d["id"] for d in docs}
    init_sha = M.sha256_text(draft)

    prev_cove = T.COVE_ENABLED
    trace: list[dict] = []
    cur, step, issues = draft, 0, ""
    try:
        T.COVE_ENABLED = cove_enabled
        while True:
            issues = T._critique_answer(cur, reg_context, retrieved_ids)
            trace.append({"arm": arm_name, "round": step,
                          "check_input_sha256": M.sha256_text(cur),
                          "issues": issues, "passed": not issues})
            if issues and not early_stop(step):
                out = T.node_revise({"critic_issues": issues, "draft_answer": cur, "step": step})
                cur = out["draft_answer"]
                step += 1
            else:
                break
        degraded = bool(issues)
        final = cur + T._DEGRADE_NOTICE if degraded else cur
        if not degraded:
            reason = "passed"
        elif early_stop(step):
            reason = "budget_exhausted"
        else:
            reason = "degraded"
    finally:
        T.COVE_ENABLED = prev_cove

    return ({"arm": arm_name, "final_answer": final, "final_sha256": M.sha256_text(final),
             "initial_draft_sha256": init_sha, "revisions": step,
             "degraded": degraded, "terminated_reason": reason}, trace)


# ── §6.2 冻结检索（一次）────────────────────────────────────────────────────
PILOT_IDS = ["EQ-002", "EQ-008", "EQ-012", "EQ-027", "EQ-034"]  # §17


def freeze_retrieval(question: str, edu_level: str | None = None) -> tuple[list[dict], list[dict]]:
    """每题只跑一次真实检索；预算 query_vec 并断言非空以杜绝静默关键词降级（§6.2/§20）。

    返回 (serial_docs 供节点复用, snapshot_rows 供落盘)。
    """
    from rag.retriever import retrieve, embed_query
    qvec = embed_query(question)
    if not qvec:
        raise RuntimeError(f"embed_query 返回空，无法保证向量检索：{question[:24]}")
    docs = retrieve(question, edu_level=edu_level, query_vec=qvec)
    if not docs:
        raise RuntimeError(f"检索返回空：{question[:24]}")
    serial, snap = [], []
    for rank, d in enumerate(docs, start=1):
        serial.append({"id": d.id, "doc_type": d.doc_type, "title": d.title,
                       "content": d.content, "score": d.score})
        snap.append({"rank": rank, "id": d.id, "doc_type": d.doc_type, "title": d.title,
                     "content": d.content, "score": d.score,
                     "content_sha256": M.sha256_text(d.content or "")})
    return serial, snap


# ── §6.3 共享 Generate（一次）────────────────────────────────────────────────
def shared_generate(question: str, edu_level: str | None,
                    docs_serial: list[dict], client: "ObservableLLMClient") -> tuple[str, list[str]]:
    """在冻结检索上调用一次生产同款 node_generate（单次 LLM 调用，温度 0.3）。"""
    from langchain_core.messages import HumanMessage
    import agents.tutor as T
    state = {
        "messages": [HumanMessage(content=question)],
        "edu_level": edu_level, "retrieved_docs": docs_serial,
        "query_vec": None, "user_id": None,
        "profile_hint": "", "summary": "", "current_state": {}, "step": 0,
        "timings_ms": T._new_timings(), "stage_counts": T._new_stage_counts(),
    }
    client.current_stage = "generate"
    out = T.node_generate(state)
    client.current_stage = None
    return out["draft_answer"], out["gen_contexts"]


# ── 单题编排：冻结检索 → 共享 Generate → A/B/C ───────────────────────────────
def run_one_question(record: dict, client: "ObservableLLMClient") -> dict:
    q, edu, rid = record["question"], record.get("edu_level"), record["id"]
    docs_serial, retr_snap = freeze_retrieval(q, edu)

    i_gen0 = len(client.calls)
    draft, gen_contexts = shared_generate(q, edu, docs_serial, client)
    gen_calls = client.calls[i_gen0:]
    draft_sha = M.sha256_text(draft)

    a = run_arm_A(draft)

    client.current_stage = "arm_B"
    iB0 = len(client.calls)
    b, trace_b = run_arm(draft, docs_serial, cove_enabled=False, arm_name="B")
    b_calls = client.calls[iB0:]

    client.current_stage = "arm_C"
    iC0 = len(client.calls)
    c, trace_c = run_arm(draft, docs_serial, cove_enabled=True, arm_name="C")
    c_calls = client.calls[iC0:]
    client.current_stage = None

    # §20 硬校验
    b_types = [x["call_type"] for x in b_calls]
    if "critic_cove" in b_types:
        raise AssertionError(f"{rid}: B 组出现 CoVe 调用（违反 §20）")
    if not (a["initial_draft_sha256"] == b["initial_draft_sha256"] == c["initial_draft_sha256"] == draft_sha):
        raise AssertionError(f"{rid}: A/B/C 初稿 SHA 不一致（违反 §20/E3）")

    return {
        "id": rid, "question": q, "edu_level": edu,
        "retrieval_snapshot": retr_snap,
        "generation": {"id": rid, "draft": draft, "draft_sha256": draft_sha,
                       "gen_contexts": gen_contexts,
                       "generate_call_ids": [x["call_id"] for x in gen_calls]},
        "arms": {"A": a, "B": b, "C": c},
        "critic_trace": trace_b + trace_c,
        "call_ids": {"generate": [x["call_id"] for x in gen_calls],
                     "B": [x["call_id"] for x in b_calls],
                     "C": [x["call_id"] for x in c_calls]},
    }


# ── §17 试跑 / §18 全量运行器 ────────────────────────────────────────────────
_LLM_CALL_KEYS = ("call_id", "call_type", "stage_tag", "model", "temperature",
                  "enable_thinking", "usage", "usage_available", "latency_ms",
                  "execution_mode", "replay_of", "request_sha256")


def _slim_call(rec: dict, keep_messages: bool) -> dict:
    out = {k: rec.get(k) for k in _LLM_CALL_KEYS}
    if keep_messages:
        out["messages"] = rec.get("messages")
        out["raw_response"] = rec.get("raw_response")
    return out


def _predict_budget(client: "ObservableLLMClient", n_done: int, n_target: int,
                    wall_ms: int) -> dict:
    live = [c for c in client.calls if c["execution_mode"] == "live"]
    def _tok(k):
        return sum((c.get("usage") or {}).get(k, 0) or 0 for c in live if c.get("usage"))
    phys = len(live)
    usage_missing = sum(1 for c in live if not c["usage_available"])
    scale = (n_target / n_done) if n_done else 0
    return {
        "n_done": n_done, "n_target": n_target,
        "physical_calls_done": phys, "logical_calls_done": len(client.calls),
        "prompt_tokens_done": _tok("prompt_tokens"),
        "completion_tokens_done": _tok("completion_tokens"),
        "total_tokens_done": _tok("total_tokens"),
        "wall_ms_done": wall_ms,
        "predicted_physical_calls_full": round(phys * scale),
        "predicted_total_tokens_full": round(_tok("total_tokens") * scale),
        "predicted_wall_ms_full": round(wall_ms * scale),
        "usage_missing_calls": usage_missing,
        "note": "预测按逐题线性外推；usage 缺失时 token/成本口径需用户确认（§20）。",
    }


def run_experiment(dataset: str, mode: str, confirm_paid: bool) -> int:
    """§17/§18：pilot（5 题）或 full（38 题）。会产生付费 LLM 调用。"""
    if not confirm_paid:
        print("[拒绝] 该模式会产生付费 LLM 调用，必须显式传 --confirm-paid。未执行任何调用。")
        return 3

    # 预检（只检查、不建目录）：数据契约 + 环境 + 索引 + 锚定
    info = _collect_preflight(dataset)
    if not info["passed"]:
        print("[中止] 预检未通过，拒绝进入付费运行。")
        return 1

    records = info["records"]
    by_id = {r["id"]: r for r in records}
    if mode == "pilot":
        target = [by_id[i] for i in PILOT_IDS if i in by_id]
        if len(target) != len(PILOT_IDS):
            print(f"[中止] 试跑题缺失：{[i for i in PILOT_IDS if i not in by_id]}")
            return 1
    else:
        target = records

    # 唯一结果目录（本次运行只建一个，预检信息写入同一目录）
    results_dir = make_results_dir(info["git_snap"].get("head_short") or "nogit")
    write_json(results_dir / "manifest.json",
               _preflight_manifest(f"critic_ablation_{mode}", info, "running"))
    write_jsonl(results_dir / "dataset_snapshot.jsonl", records)

    # 索引在本进程内构建（node_generate/retrieve 依赖进程内 HNSW）
    import rag.vector_index as vi
    vi.rebuild()

    client = ObservableLLMClient()
    import agents.tutor as T
    orig_llm = T._llm_chat
    orig_cache = getattr(T, "SEMANTIC_CACHE_ENABLED", None)
    T._llm_chat = client
    if orig_cache is not None:
        T.SEMANTIC_CACHE_ENABLED = False   # §9 评测期关缓存

    f_retr = (results_dir / "retrieval_snapshot.jsonl").open("w", encoding="utf-8")
    f_gen = (results_dir / "generation.jsonl").open("w", encoding="utf-8")
    f_arm = (results_dir / "arm_results.jsonl").open("w", encoding="utf-8")
    f_trace = (results_dir / "critic_trace.jsonl").open("w", encoding="utf-8")
    f_calls = (results_dir / "llm_calls.jsonl").open("w", encoding="utf-8")

    wall0 = time.monotonic()
    done, errors = 0, []
    try:
        for rec in target:
            calls_before = len(client.calls)
            try:
                r = run_one_question(rec, client)
            except Exception as e:  # noqa: BLE001  §20：单题失败落盘，不从分母删
                errors.append({"id": rec["id"], "error": repr(e)})
                f_arm.write(json.dumps({"id": rec["id"], "error": repr(e)}, ensure_ascii=False) + "\n")
                f_arm.flush()
                print(f"  [ERR] {rec['id']}: {e!r}")
                continue
            for row in r["retrieval_snapshot"]:
                # qid 在前、**row 在后仍会保留 qid，因为 row 用 "id" 存文档 id、不冲突
                f_retr.write(json.dumps({"qid": r["id"], **row}, ensure_ascii=False) + "\n")
            f_gen.write(json.dumps(r["generation"], ensure_ascii=False) + "\n")
            for arm in ("A", "B", "C"):
                f_arm.write(json.dumps(r["arms"][arm] | {"id": r["id"]}, ensure_ascii=False) + "\n")
            for t in r["critic_trace"]:
                f_trace.write(json.dumps(t | {"id": r["id"]}, ensure_ascii=False) + "\n")
            for c in client.calls[calls_before:]:
                f_calls.write(json.dumps(_slim_call(c, keep_messages=True), ensure_ascii=False) + "\n")
            for f in (f_retr, f_gen, f_arm, f_trace, f_calls):
                f.flush()
            done += 1
            print(f"  [{done}/{len(target)}] {r['id']} done "
                  f"(B rev={r['arms']['B']['revisions']}, C rev={r['arms']['C']['revisions']})")
    finally:
        T._llm_chat = orig_llm
        if orig_cache is not None:
            T.SEMANTIC_CACHE_ENABLED = orig_cache
        for f in (f_retr, f_gen, f_arm, f_trace, f_calls):
            f.close()

    wall_ms = int((time.monotonic() - wall0) * 1000)
    budget = _predict_budget(client, done, 38, wall_ms)
    summary = {"kind": f"critic_ablation_{mode}", "mode": mode,
               "n_done": done, "n_errors": len(errors), "errors": errors,
               "budget_prediction": budget}
    write_json(results_dir / "summary.json", summary)
    mani = json.loads((results_dir / "manifest.json").read_text(encoding="utf-8"))
    # 单题错误不能被标记为 complete：保留失败清单，区分全失败与部分完成。
    # complete 只表示目标题目全部成功落盘。
    run_status = (
        "complete" if not errors and done == len(target)
        else "partial" if done
        else "failed"
    )
    mani.update({
        "status": run_status,
        "n_done": done,
        "n_target": len(target),
        "n_errors": len(errors),
        "errors": errors,
    })
    write_json(results_dir / "manifest.json", mani)

    print("-" * 64)
    print(f"  {mode} 完成：{done}/{len(target)}  错误 {len(errors)}")
    print(f"  物理调用 {budget['physical_calls_done']} 次 / 逻辑 {budget['logical_calls_done']} 次 / "
          f"total_tokens {budget['total_tokens_done']} / 墙钟 {wall_ms}ms")
    if mode == "pilot":
        print(f"  【38 题预测】物理调用≈{budget['predicted_physical_calls_full']}，"
              f"total_tokens≈{budget['predicted_total_tokens_full']}，"
              f"墙钟≈{budget['predicted_wall_ms_full'] // 1000}s")
        print(f"  usage 缺失调用数：{budget['usage_missing_calls']}")
        print("  >>> 全量运行需你确认上述预算后再执行 --mode full --confirm-paid（§17.12）。")
    print(f"  结果目录：{results_dir.resolve()}")
    return 0 if run_status == "complete" else 1


# ── 确定性分析（无付费；语义/混淆矩阵/修订成败留待 Judge+人工）─────────────
def _load_jsonl(p: Path) -> list[dict]:
    return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]


def _arm_answer_metrics(answer: str, gold_reg: set[str], answer_points: list[str]) -> dict:
    """单个答案的确定性指标（引用格式/ID泄漏/引用金标条号召回/要点字面覆盖）。"""
    from eval.ragas_eval import _extract_cited_articles, _main_gmp_article
    cited = _extract_cited_articles(answer)
    gold_articles = {a for r in gold_reg if (a := _main_gmp_article(r)) is not None}
    cit_gold_recall = (len(gold_articles & cited) / len(gold_articles)) if gold_articles else None
    return {
        "citation_format_valid_rate": M.citation_format_valid_rate(answer),
        "internal_id_leak_count": M.count_internal_id_leaks(answer),
        "citation_gold_recall": cit_gold_recall,
        "literal_point_coverage": M.literal_point_coverage(answer, answer_points),
        "answer_len": len(answer),
        "cited_articles": sorted(cited),
    }


def _macro(vals: list) -> float | None:
    xs = [v for v in vals if v is not None]
    return sum(xs) / len(xs) if xs else None


def analyze_results(results_dir: str) -> dict:
    """读取一次运行的原始产物，计算确定性指标，落盘 deterministic_metrics.jsonl +
    human_review.csv + REPORT.md。不做任何 LLM 调用。"""
    import csv
    d = Path(results_dir)
    dataset = {r["id"]: r for r in _load_jsonl(d / "dataset_snapshot.jsonl")}
    # 检索快照按题归组：优先用 qid 字段；旧数据无 qid 则用 generation.jsonl 题序 + rank==1 边界重建
    retr: dict[str, list] = {}
    retr_rows = _load_jsonl(d / "retrieval_snapshot.jsonl")
    if retr_rows and "qid" in retr_rows[0]:
        for row in retr_rows:
            retr.setdefault(row["qid"], []).append(row)
    else:
        gen_order = [g["id"] for g in _load_jsonl(d / "generation.jsonl")]
        blocks, cur = [], []
        for row in retr_rows:
            if row["rank"] == 1 and cur:
                blocks.append(cur)
                cur = []
            cur.append(row)
        if cur:
            blocks.append(cur)
        if len(blocks) != len(gen_order):
            print(f"  [警告] 检索块数 {len(blocks)} 与题数 {len(gen_order)} 不一致，按最短对齐")
        for qid, blk in zip(gen_order, blocks):
            retr[qid] = blk
    arms: dict[str, dict] = {}
    arm_errors = []
    for a in _load_jsonl(d / "arm_results.jsonl"):
        if "error" in a:
            arm_errors.append(a)
            continue
        arms.setdefault(a["id"], {})[a["arm"]] = a
    traces: dict[tuple, list] = {}
    for t in _load_jsonl(d / "critic_trace.jsonl"):
        traces.setdefault((t["id"], t["arm"]), []).append(t)
    calls = _load_jsonl(d / "llm_calls.jsonl") if (d / "llm_calls.jsonl").exists() else []

    per_q = []
    for qid, rec in dataset.items():
        if qid not in arms:
            continue
        gold_reg = set(rec.get("expect_reg_ids") or [])
        gold_kp = set(rec.get("expect_kp_ids") or [])
        aps = rec.get("answer_points") or []
        docs = sorted(retr.get(qid, []), key=lambda r: r["rank"])
        reg_ret = M._dedup_keep_order([r["id"] for r in docs if r["doc_type"] == "regulation"])
        kp_ret = M._dedup_keep_order([r["id"] for r in docs if r["doc_type"] == "kp"])
        retrieval = {
            "reg_recall@3": M.recall_at_k(reg_ret, gold_reg, 3),
            "reg_recall@5": M.recall_at_k(reg_ret, gold_reg, 5),
            "reg_recall@10": M.recall_at_k(reg_ret, gold_reg, 10),
            "reg_mrr": M.mrr(reg_ret, gold_reg),
            "reg_first_hit_rank": M.first_hit_rank(reg_ret, gold_reg),
            "kp_recall@10": M.recall_at_k(kp_ret, gold_kp, 10),
        }
        row = {"id": qid, "retrieval": retrieval, "arms": {}, "critic": {}}
        for arm in ("A", "B", "C"):
            a = arms[qid].get(arm)
            if not a:
                continue
            m = _arm_answer_metrics(a["final_answer"], gold_reg, aps)
            m.update({"revisions": a["revisions"], "degraded": a["degraded"],
                      "terminated_reason": a["terminated_reason"]})
            row["arms"][arm] = m
        # 触发观测
        tb, tc = traces.get((qid, "B"), []), traces.get((qid, "C"), [])
        row["critic"] = {
            "B_first_round_issue": bool(tb and not tb[0]["passed"]),
            "B_any_issue": any(not t["passed"] for t in tb),
            "C_cove_specific_issue": any("[CoVe]" in (t["issues"] or "") for t in tc),
            "B_rounds": len(tb), "C_rounds": len(tc),
        }
        per_q.append(row)

    # 汇总（宏平均）
    def col(arm, key):
        return _macro([q["arms"].get(arm, {}).get(key) for q in per_q])
    agg = {"n_questions": len(per_q), "arm_errors": arm_errors}
    agg["retrieval"] = {k: _macro([q["retrieval"][k] for q in per_q])
                        for k in per_q[0]["retrieval"]} if per_q else {}
    for arm in ("A", "B", "C"):
        agg[f"arm_{arm}"] = {
            "citation_format_valid_rate": col(arm, "citation_format_valid_rate"),
            "internal_id_leak_count_mean": col(arm, "internal_id_leak_count"),
            "citation_gold_recall": col(arm, "citation_gold_recall"),
            "literal_point_coverage": col(arm, "literal_point_coverage"),
            "revisions_mean": col(arm, "revisions"),
            "degraded_rate": _macro([1.0 if q["arms"].get(arm, {}).get("degraded") else 0.0
                                     for q in per_q if arm in q["arms"]]),
        }
    # 效率（按 stage_tag 归组）
    eff = {}
    for stage in ("generate", "arm_B", "arm_C"):
        sc = [c for c in calls if c.get("stage_tag") == stage]
        live = [c for c in sc if c.get("execution_mode") == "live"]
        eff[stage] = {
            "logical_calls": len(sc), "physical_calls": len(live),
            "total_tokens_live": sum((c.get("usage") or {}).get("total_tokens", 0) or 0 for c in live),
            "latency_p50_live": M.percentile_hf7([c["latency_ms"] for c in live], 50),
            "latency_p95_live": M.percentile_hf7([c["latency_ms"] for c in live], 95),
        }
    agg["efficiency_by_stage"] = eff
    agg["cove_specific_trigger_rate"] = _macro(
        [1.0 if q["critic"]["C_cove_specific_issue"] else 0.0 for q in per_q]) if per_q else None
    agg["B_first_round_trigger_rate"] = _macro(
        [1.0 if q["critic"]["B_first_round_issue"] else 0.0 for q in per_q]) if per_q else None

    write_jsonl(d / "deterministic_metrics.jsonl", per_q)
    write_json(d / "deterministic_summary.json", agg)

    # human_review.csv（§14.2 抽样：不代替人工判断，只预生成待标注样本）
    review_rows = []
    for q in per_q:
        bc_diff = (arms[q["id"]]["B"]["final_answer"] != arms[q["id"]]["C"]["final_answer"])
        revised = any(q["arms"].get(a, {}).get("revisions", 0) > 0 for a in ("B", "C"))
        if bc_diff or revised or q["arms"].get("B", {}).get("degraded"):
            review_rows.append({
                "id": q["id"], "reason": ";".join(filter(None, [
                    "revised" if revised else "", "B!=C" if bc_diff else "",
                    "degraded" if q["arms"].get("B", {}).get("degraded") else ""])),
                "draft_correct": "", "error_in_scope": "", "critic_false_alarm": "",
                "issue_fixed": "", "new_error": "", "final_vs_draft": "",
            })
    with (d / "human_review.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["id", "reason", "draft_correct", "error_in_scope",
                                          "critic_false_alarm", "issue_fixed", "new_error", "final_vs_draft"])
        w.writeheader()
        w.writerows(review_rows)

    _write_report(d, agg, per_q, len(review_rows))
    print(f"  分析完成 → {d/'REPORT.md'}")
    print(f"  确定性汇总：{json.dumps(agg, ensure_ascii=False)[:200]}…")
    return agg


def _fmt(v) -> str:
    if v is None:
        return "N/A"
    return f"{v:.3f}" if isinstance(v, float) else str(v)


def _write_report(d: Path, agg: dict, per_q: list, n_review: int) -> None:
    L = []
    L.append("# Critic / CoVe / Revise 消融实验报告（确定性部分）\n")
    L.append("> 本报告只含**确定性指标**。语义覆盖、语义 Faithfulness、Critic 混淆矩阵、")
    L.append("> 修订成败/退化的严重度判定依赖 LLM Judge + 盲化人工复核，属后续阶段，此处标记为待办。\n")
    L.append("\n## 1. 代码事实（不可与实验结果混淆）\n")
    L.append("- 链路：retrieve→generate→critique→(respond|revise→critique)，A=Generate Only，"
             "B=Critic+Revise(CoVe关)，C=+CoVe。\n")
    L.append("- 每题冻结检索一次、共享初稿一次；A/B/C 初稿 SHA 恒等（硬断言）。\n")
    L.append(f"- 本次有效题数：{agg['n_questions']}；单题失败：{len(agg['arm_errors'])}。\n")

    L.append("\n## 2. 检索指标（三组相同，只报一次）\n")
    r = agg["retrieval"]
    L.append("| reg_recall@3 | @5 | @10 | reg_MRR | kp_recall@10 |\n|---|---|---|---|---|\n")
    L.append(f"| {_fmt(r.get('reg_recall@3'))} | {_fmt(r.get('reg_recall@5'))} | "
             f"{_fmt(r.get('reg_recall@10'))} | {_fmt(r.get('reg_mrr'))} | {_fmt(r.get('kp_recall@10'))} |\n")

    L.append("\n## 3. A/B/C 答案确定性指标（宏平均）\n")
    L.append("| 组 | 引用格式完整率 | 引用金标条号召回 | 要点字面覆盖 | 内部ID泄漏(均) | 平均修订轮 | 降级率 |\n")
    L.append("|---|---|---|---|---|---|---|\n")
    for arm in ("A", "B", "C"):
        a = agg[f"arm_{arm}"]
        L.append(f"| {arm} | {_fmt(a['citation_format_valid_rate'])} | {_fmt(a['citation_gold_recall'])} | "
                 f"{_fmt(a['literal_point_coverage'])} | {_fmt(a['internal_id_leak_count_mean'])} | "
                 f"{_fmt(a['revisions_mean'])} | {_fmt(a['degraded_rate'])} |\n")

    L.append("\n## 4. Critic / CoVe 触发（确定性观测）\n")
    L.append(f"- B 首轮触发率：{_fmt(agg['B_first_round_trigger_rate'])}\n")
    L.append(f"- CoVe 专属触发率（C 组 critic 通过后 CoVe 又报问题）：{_fmt(agg['cove_specific_trigger_rate'])}\n")

    L.append("\n## 5. 效率（按阶段，物理=live 调用）\n")
    L.append("| 阶段 | 逻辑调用 | 物理调用 | live总token | 延迟P50 | 延迟P95 |\n|---|---|---|---|---|---|\n")
    for s, e in agg["efficiency_by_stage"].items():
        L.append(f"| {s} | {e['logical_calls']} | {e['physical_calls']} | {e['total_tokens_live']} | "
                 f"{_fmt(e['latency_p50_live'])} | {_fmt(e['latency_p95_live'])} |\n")

    L.append("\n## 6. 退化题（逐题，需人工确认严重度）\n")
    degraded = [q["id"] for q in per_q if q["arms"].get("B", {}).get("degraded")
                or q["arms"].get("C", {}).get("degraded")]
    L.append(f"- 触发降级（预算耗尽仍有问题）的题：{degraded or '无'}\n")

    L.append("\n## 7. 待办（Judge + 人工）\n")
    L.append(f"- `human_review.csv` 已预生成 {n_review} 条待人工盲标样本（§14.2）。\n")
    L.append("- 语义要点覆盖 / 语义 Faithfulness / Critic 混淆矩阵(TP/FP/FN/TN) / 修订成功率与退化严重度 "
             "/ 配对 bootstrap+McNemar 显著性：需独立 Judge 打分与人工校准后填入。\n")

    (d / "REPORT.md").write_text("".join(L), encoding="utf-8")


# ── §14 独立 Judge（盲化、去重、temp0；模型≠Generator）─────────────────────
_COV_MAP = {"covered": 1.0, "partial": 0.5, "missing": 0.0}


def _extract_json(text: str) -> dict | None:
    if not text:
        return None
    m = re.search(r"\{.*\}", text.strip(), re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:  # noqa: BLE001
        return None


def build_coverage_prompt(question: str, answer: str, answer_points: list[str]) -> str:
    """§13.3 语义要点覆盖评分 prompt——盲化：不含组别/Critic/修订等信息。"""
    pts = "\n".join(f"{i}. {p}" for i, p in enumerate(answer_points, 1))
    return (
        "你是GMP法规问答评分专家。给定问题、标准答案要点清单、以及一份待评答案。\n"
        "判断待评答案对每个要点的覆盖：covered(完整覆盖)/partial(部分覆盖)/missing(未覆盖)。\n"
        "只依据待评答案内容判断，不要臆测。\n\n"
        f"问题：{question}\n\n标准答案要点：\n{pts}\n\n待评答案：\n{answer}\n\n"
        '只输出JSON：{"points":[{"i":1,"verdict":"covered"},...]}，i 从1开始对应要点顺序。'
    )


def parse_coverage(reply: str, n_points: int) -> tuple[float | None, list | None]:
    obj = _extract_json(reply)
    if not obj or "points" not in obj:
        return (None, None)
    verdicts: list = [None] * n_points
    for p in obj.get("points", []):
        i, v = p.get("i"), str(p.get("verdict", "")).lower()
        if isinstance(i, int) and 1 <= i <= n_points and v in _COV_MAP:
            verdicts[i - 1] = v
    if all(v is None for v in verdicts):
        return (None, None)
    filled = [v if v is not None else "missing" for v in verdicts]
    score = sum(_COV_MAP[v] for v in filled) / n_points
    return (score, filled)


def build_faithfulness_prompt(question: str, answer: str, gen_contexts: list[str]) -> str:
    """§13.4 语义 Faithfulness 评分 prompt——只看 Generator 实际用的 gen_contexts，盲化。"""
    ctx = "\n".join(gen_contexts)[:8000]
    return (
        "你是GMP法规忠实性评分专家。判断回答中的事实性声明是否都能被参考资料支持。\n"
        "只依据参考资料，不要用外部知识。\n\n"
        f"问题：{question}\n\n参考资料：\n{ctx}\n\n回答：\n{answer}\n\n"
        "逐条核对关键事实声明。只输出JSON："
        '{"n_claims":总声明数,"n_supported":被参考资料支持的声明数,"faithfulness":0到1之间的小数}'
    )


def parse_faithfulness(reply: str) -> tuple[float | None, dict | None]:
    obj = _extract_json(reply)
    if not obj:
        return (None, None)
    f = obj.get("faithfulness")
    if f is None and obj.get("n_claims"):
        try:
            f = obj["n_supported"] / obj["n_claims"]
        except Exception:  # noqa: BLE001
            f = None
    try:
        f = float(f)
    except (TypeError, ValueError):
        return (None, None)
    return (max(0.0, min(1.0, f)), obj)


def collect_unique_answers(arms: dict) -> list[dict]:
    """去重：相同 (qid, 答案SHA) 只判一次，记录它对应哪些 arm。"""
    uniq: dict = {}
    for qid, per in arms.items():
        for arm, a in per.items():
            if "final_answer" not in a:
                continue
            sha = a.get("final_sha256") or M.sha256_text(a["final_answer"])
            key = (qid, sha)
            if key not in uniq:
                uniq[key] = {"qid": qid, "answer": a["final_answer"],
                             "answer_sha256": sha, "arms": []}
            uniq[key]["arms"].append(arm)
    return list(uniq.values())


def _judge_call(prompt: str, model: str, post_fn=None) -> str:
    body = {"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": 0.0}
    if post_fn is not None:
        return post_fn(body)
    import httpx
    from config import LLM_BASE_URL, LLM_API_KEY
    resp = httpx.post(f"{LLM_BASE_URL}/chat/completions",
                      headers={"Authorization": f"Bearer {LLM_API_KEY}"},
                      json=body, timeout=120)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def run_judge(results_dir: str, confirm_paid: bool, judge_model: str = "qwen-max") -> int:
    """§14：对已完成运行做独立 Judge（语义要点覆盖 + 语义 Faithfulness），付费。"""
    if not confirm_paid:
        print("[拒绝] Judge 会产生付费 LLM 调用，必须显式 --confirm-paid。未执行任何调用。")
        return 3
    from config import LLM_MODEL
    d = Path(results_dir)
    dataset = {r["id"]: r for r in _load_jsonl(d / "dataset_snapshot.jsonl")}
    gen = {g["id"]: g for g in _load_jsonl(d / "generation.jsonl")}
    arms: dict = {}
    for a in _load_jsonl(d / "arm_results.jsonl"):
        if "error" in a:
            continue
        arms.setdefault(a["id"], {})[a["arm"]] = a
    uniq = collect_unique_answers(arms)

    indep = "独立(与Generator不同模型)" if judge_model != LLM_MODEL else "⚠️非独立(与Generator同模型)→仅探索性"
    print(f"  Judge 模型：{judge_model}（{indep}）；Generator：{LLM_MODEL}")
    print(f"  唯一答案数：{len(uniq)}（去重后）→ 判分调用 ≈ {len(uniq) * 2}（覆盖+忠实各一次）")

    judged = {}   # (qid,sha) -> {coverage, faithfulness, ...}
    fout = (d / "judge_results.jsonl").open("w", encoding="utf-8")
    try:
        for k, u in enumerate(uniq, 1):
            rec = dataset[u["qid"]]
            aps = rec.get("answer_points") or []
            ctx = gen.get(u["qid"], {}).get("gen_contexts") or []
            cov_reply = _judge_call(build_coverage_prompt(rec["question"], u["answer"], aps), judge_model)
            cov_score, cov_v = parse_coverage(cov_reply, len(aps))
            ff_reply = _judge_call(build_faithfulness_prompt(rec["question"], u["answer"], ctx), judge_model)
            ff_score, ff_d = parse_faithfulness(ff_reply)
            row = {"qid": u["qid"], "answer_sha256": u["answer_sha256"], "arms": u["arms"],
                   "coverage": cov_score, "coverage_verdicts": cov_v,
                   "faithfulness": ff_score, "judge_model": judge_model}
            judged[(u["qid"], u["answer_sha256"])] = row
            fout.write(json.dumps(row, ensure_ascii=False) + "\n")
            fout.flush()
            print(f"  [{k}/{len(uniq)}] {u['qid']} arms={u['arms']} cov={cov_score} ff={ff_score}")
    finally:
        fout.close()

    # 映射回每题每组 + 配对 A vs B
    per_arm_scores = {arm: {"coverage": [], "faithfulness": []} for arm in "ABC"}
    ab_cov_diff, ab_ff_diff = [], []
    for qid, per in arms.items():
        arm_score = {}
        for arm, a in per.items():
            sha = a.get("final_sha256") or M.sha256_text(a["final_answer"])
            j = judged.get((qid, sha))
            if j:
                arm_score[arm] = j
                per_arm_scores[arm]["coverage"].append(j["coverage"])
                per_arm_scores[arm]["faithfulness"].append(j["faithfulness"])
        if "A" in arm_score and "B" in arm_score:
            ca, cb = arm_score["A"]["coverage"], arm_score["B"]["coverage"]
            fa, fb = arm_score["A"]["faithfulness"], arm_score["B"]["faithfulness"]
            if ca is not None and cb is not None:
                ab_cov_diff.append(cb - ca)
            if fa is not None and fb is not None:
                ab_ff_diff.append(fb - fa)

    def _mac(xs):
        v = [x for x in xs if x is not None]
        return sum(v) / len(v) if v else None

    # A vs B 配对显著性（B-A）
    cov_improved = sum(1 for x in ab_cov_diff if x > 0)
    cov_degraded = sum(1 for x in ab_cov_diff if x < 0)
    summary = {
        "judge_model": judge_model, "independent": judge_model != LLM_MODEL,
        "n_unique_judged": len(uniq),
        "arm_semantic": {arm: {"coverage": _mac(per_arm_scores[arm]["coverage"]),
                               "faithfulness": _mac(per_arm_scores[arm]["faithfulness"])}
                         for arm in "ABC"},
        "A_vs_B": {
            "n_pairs": len(ab_cov_diff),
            "coverage_mean_diff_B_minus_A": _mac(ab_cov_diff),
            "coverage_ci95": M.paired_bootstrap_ci(ab_cov_diff, iters=10000, seed=0),
            "coverage_improved": cov_improved, "coverage_degraded": cov_degraded,
            "coverage_mcnemar_p": M.mcnemar_exact(cov_improved, cov_degraded),
            "faithfulness_mean_diff_B_minus_A": _mac(ab_ff_diff),
            "faithfulness_ci95": M.paired_bootstrap_ci(ab_ff_diff, iters=10000, seed=0),
        },
    }
    write_json(d / "judge_summary.json", summary)
    print("-" * 64)
    print(f"  Judge 完成。语义覆盖 A/B/C = "
          f"{_mac(per_arm_scores['A']['coverage'])}/{_mac(per_arm_scores['B']['coverage'])}/"
          f"{_mac(per_arm_scores['C']['coverage'])}")
    print(f"  Faithfulness A/B/C = {_mac(per_arm_scores['A']['faithfulness'])}/"
          f"{_mac(per_arm_scores['B']['faithfulness'])}/{_mac(per_arm_scores['C']['faithfulness'])}")
    print(f"  A→B 覆盖：改善 {cov_improved} / 退化 {cov_degraded} 题；均值差(B-A)="
          f"{_mac(ab_cov_diff)}；McNemar p={summary['A_vs_B']['coverage_mcnemar_p']:.4f}")
    print(f"  结果：{(d / 'judge_summary.json').resolve()}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Critic/CoVe/Revise 消融 harness")
    ap.add_argument("--dataset", default=DEFAULT_DATASET)
    ap.add_argument("--preflight-only", action="store_true")
    ap.add_argument("--mode", choices=["pilot", "full"])
    ap.add_argument("--confirm-paid", action="store_true")
    ap.add_argument("--analyze", metavar="RESULTS_DIR",
                    help="对已完成运行目录做确定性分析（无付费）")
    ap.add_argument("--judge", metavar="RESULTS_DIR",
                    help="对已完成运行目录做独立 Judge 语义评分（付费，需 --confirm-paid）")
    ap.add_argument("--judge-model", default="qwen-max",
                    help="Judge 模型（须≠Generator 以保独立性；默认 qwen-max）")
    args = ap.parse_args(argv)

    if args.judge:
        return run_judge(args.judge, args.confirm_paid, args.judge_model)
    if args.analyze:
        analyze_results(args.analyze)
        return 0
    if args.preflight_only or not args.mode:
        res = preflight(args.dataset)
        return 0 if res["passed"] else 1

    return run_experiment(args.dataset, args.mode, args.confirm_paid)


if __name__ == "__main__":
    raise SystemExit(main())
