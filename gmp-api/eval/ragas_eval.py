"""
D3/D7 RAGAS-风格 三维评测（自写 LLM judge，**非官方 ragas 包**）：Context Precision / Faithfulness / Answer Relevance。
注：本模块用自写的 LLM 评判逻辑近似 RAGAS 指标，结果不应直接等同官方 RAGAS 包的数值。

用法：
  cd gmp-api
  python -m eval.ragas_eval               # 评测全部金标集
  python -m eval.ragas_eval --n 10        # 只评测前10题（调试用）
  python -m eval.ragas_eval --out result.json  # 保存详细结果

诊断映射（依据 04-eval-loop.md §4.3）：
  Context Precision  低 → 调 embedding/top-k/re-rank（回 Spec 01）
  Faithfulness       低 → 生成在乱带节奏（调 prompt/CoVe）
  Answer Relevance   低 → 意图理解问题（调指令/prompt）

红线（master §4.1）：
  Faithfulness ≥ 0.85
  Context Precision ≥ 0.70
"""
from __future__ import annotations

import argparse
import contextlib
import datetime
import hashlib
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

from config import EVAL_GOLDEN_PATH, RAGAS_JUDGE_MODEL, LLM_BASE_URL, LLM_API_KEY

# ── 红线阈值 ─────────────────────────────────────────────────────────────────
THRESHOLD_FAITHFULNESS       = 0.85
THRESHOLD_CONTEXT_PRECISION  = 0.70

# ── 诊断映射 ─────────────────────────────────────────────────────────────────
DIAGNOSIS = {
    "context_precision":  "Context Precision 低 → 调 embedding/top-k/re-rank（回 Spec 01）",
    "faithfulness":       "Faithfulness 低 → 草稿在乱带节奏（调 prompt 或开启 CoVe）",
    "answer_relevance":   "Answer Relevance 低 → 意图理解问题（调系统指令/prompt）",
}


def _llm(prompt: str) -> str:
    """调 DashScope 作为自写评判 LLM（RAGAS 风格，非官方 ragas 包）。"""
    import httpx
    resp = httpx.post(
        f"{LLM_BASE_URL}/chat/completions",
        headers={"Authorization": f"Bearer {LLM_API_KEY}"},
        json={
            "model": RAGAS_JUDGE_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _score_context_precision(
    question: str, contexts: list[str], answer_points: list[str]
) -> tuple[float | None, dict]:
    """
    Context Precision: 检索到的 contexts 中，与 answer_points 相关的比例。
    用 LLM 判断每个 context 是否有助于回答该问题。
    LLM 异常时跳过该 context（不算不相关），全部失败时返回 None。

    返回 (score, detail)。detail 保存每个 context 的逐条判断与 judge 原始输出，供复盘。
    """
    detail: dict = {"per_context": [], "n_judged": 0, "relevant": 0}
    if not contexts:
        return 0.0, detail
    relevant = 0
    n_judged = 0
    for i, ctx in enumerate(contexts):
        prompt = (
            f"问题：{question}\n\n"
            f"参考资料片段：{ctx[:500]}\n\n"
            f"标准答案要点：{'; '.join(answer_points)}\n\n"
            "该参考资料片段是否对回答此问题有帮助？\n"
            "只回复：YES 或 NO"
        )
        try:
            res = _llm(prompt)
            n_judged += 1
            is_yes = res.strip().upper().startswith("YES")
            if is_yes:
                relevant += 1
            detail["per_context"].append(
                {"idx": i, "ctx_head": ctx[:200], "verdict": "YES" if is_yes else "NO", "raw": res.strip()[:300]}
            )
        except Exception as e:  # noqa: BLE001
            detail["per_context"].append({"idx": i, "ctx_head": ctx[:200], "verdict": "ERROR", "raw": str(e)[:200]})
    detail["n_judged"] = n_judged
    detail["relevant"] = relevant
    if n_judged == 0:
        return None, detail  # 所有 LLM 调用都失败
    return relevant / n_judged, detail


def _score_faithfulness(
    answer: str, contexts: list[str]
) -> tuple[float | None, dict]:
    """
    Faithfulness: 答案中的声明有多少比例有 context 支撑。
    先让 LLM 分解声明，再逐条判断。
    contexts/answer 为空 → 0.0；解析失败或异常 → None（评测失败，不混入平均值）。

    返回 (score, detail)。detail 保存 judge 原始输出、逐条声明判断、以及本次实际喂给
    judge 的上下文/答案字符数（记录截断口径，供复盘 FF 是否被截断误伤）。
    """
    # 点2：使用**全部** contexts（不再只取前5），与模型真正看到的证据对齐；
    # 字符预算放宽（qwen3-max 长上下文足够），避免支撑条文被截断导致 FF 误判为无支撑。
    _CTX_CAP, _ANS_CAP = 12000, 4000
    ctx_text = "\n".join(contexts)
    detail: dict = {
        "raw": None, "claims": [], "n_claims": 0, "supported": 0, "error": None,
        "n_contexts_used": len(contexts),
        "ctx_chars_fed": min(len(ctx_text), _CTX_CAP),
        "answer_chars_fed": min(len(answer or ""), _ANS_CAP),
    }
    if not contexts or not answer:
        return 0.0, detail
    prompt = (
        f"参考资料：\n{ctx_text[:_CTX_CAP]}\n\n"
        f"待评估答案：\n{answer[:_ANS_CAP]}\n\n"
        "请列出答案中的关键事实声明（每行一条，最多8条）。\n"
        "然后对每条声明判断：参考资料是否支持？格式：声明 | YES/NO\n"
        "只输出声明判断列表，不要其他内容。"
    )
    try:
        res = _llm(prompt)
        detail["raw"] = res.strip()[:1500]
        lines = [l.strip() for l in res.strip().splitlines() if "|" in l]
        if not lines:
            return None, detail  # judge 输出无法解析
        supported = 0
        for l in lines:
            v = l.split("|")[-1].strip().upper() == "YES"
            supported += 1 if v else 0
            detail["claims"].append({"claim": l.rsplit("|", 1)[0].strip()[:200], "verdict": "YES" if v else "NO"})
        detail["n_claims"] = len(lines)
        detail["supported"] = supported
        return supported / len(lines), detail
    except Exception as e:  # noqa: BLE001
        detail["error"] = str(e)[:200]
        return None, detail  # LLM 调用失败


def _score_answer_relevance(question: str, answer: str) -> tuple[float | None, dict]:
    """
    Answer Relevance: 答案对问题的相关程度。
    让 LLM 根据答案反推问题，看与原问题的语义匹配度。
    answer 为空 → 0.0；解析失败或异常 → None（不再返回 0.5 偏向值）。

    返回 (score, detail)。detail 保存 judge 原始输出与解析出的原始分。
    """
    detail: dict = {"raw": None, "parsed": None, "error": None}
    if not answer:
        return 0.0, detail
    prompt = (
        f"以下是一个问答对：\n\n"
        f"问题：{question}\n"
        f"答案：{answer[:800]}\n\n"
        "该答案是否直接回答了问题？评分1-10（10=完全相关），只输出数字。"
    )
    try:
        res = _llm(prompt)
        detail["raw"] = res.strip()[:200]
        score = float(res.strip().split()[0])
        detail["parsed"] = score
        return min(max(score / 10.0, 0.0), 1.0), detail
    except Exception as e:  # noqa: BLE001
        detail["error"] = str(e)[:200]
        return None, detail  # judge 失败，不用 0.5 偏向值


# ── 点5：确定性锚定检索指标（无 LLM judge） ──────────────────────────────────
# 依赖专家锚定的 expect_reg_ids/expect_kp_ids。锚点为空（未审核态）→ 不可测，返回 None。
_CITE_RE = re.compile(r"REG-[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+")


def _extract_cited_regs(answer: str) -> list[str]:
    """从答案里抽取引用的法规条款编号（REG-xxx 字面形式），去重排序。"""
    if not answer:
        return []
    return sorted(set(_CITE_RE.findall(answer)))


# 答案里更常见的是"第X条"中文引用（tutor 不输出 REG-xxx 内部ID），需按条号匹配主规范金标。
_CN_DIGIT = {"零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4,
             "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
_ART_RE = re.compile(r"第([一二三四五六七八九十百零两]+)条")
_MAIN_GMP_RE = re.compile(r"^REG-GMP2010-A0*([0-9]+)$")


def _cn2int(s: str) -> int | None:
    """中文数字→int（覆盖 GMP 条号 1..312，如 '一百八十七'→187）。无法解析返回 None。"""
    try:
        s = s.replace("两", "二")
        total = 0
        if "百" in s:
            b, s = s.split("百", 1)
            total += _CN_DIGIT.get(b, 1) * 100
        if "十" in s:
            t, s = s.split("十", 1)
            total += (_CN_DIGIT.get(t, 1) if t else 1) * 10
        if s:
            total += _CN_DIGIT.get(s[-1], 0)
        return total or None
    except Exception:  # noqa: BLE001
        return None


def _extract_cited_articles(answer: str) -> set[int]:
    """从答案里抽取'第X条'引用的条号（int 集合）。"""
    if not answer:
        return set()
    return {n for m in _ART_RE.findall(answer) if (n := _cn2int(m)) is not None}


def _main_gmp_article(reg_id: str) -> int | None:
    """主规范 reg_id（REG-GMP2010-A###）→ 条号 int；非主规范返回 None。"""
    m = _MAIN_GMP_RE.match(reg_id or "")
    return int(m.group(1)) if m else None


def _score_anchored_retrieval(
    sources: list[str], expect_reg_ids: list[str] | None,
    expect_kp_ids: list[str] | None, answer: str,
    ks: tuple[int, ...] = (3, 5, 10),
) -> dict:
    """确定性检索命中率 / 证据锚定指标（集合运算，无 LLM）。

    - Recall@k / 总召回：命中的金标锚点 / 全部金标锚点
    - Precision：命中的金标锚点 / 检索回的条数
    - MRR / first_hit_rank：正解锚点在检索排序里第一次出现的位置
    - answer_grounding：答案引用的条款 ∩ 金标条款（引对来源没）、以及引用了但没检索到的（幻觉嫌疑）

    金标锚点为空 → measurable=False，检索类指标返回 None（当前专家未审核态即如此）；
    但 answer_grounding 的 cited/cited_not_retrieved 不依赖金标，仍产出。
    """
    gold_reg = set(expect_reg_ids or [])
    gold_kp = set(expect_kp_ids or [])
    gold = gold_reg | gold_kp
    ranked = list(sources or [])
    retrieved_set = set(ranked)

    cited_literal = set(_extract_cited_regs(answer))       # 字面 REG-xxx（tutor 少见）
    cited_articles = _extract_cited_articles(answer)       # "第X条" 条号（tutor 常见）
    # 命中的金标法规：主规范按条号匹配，其余按字面 REG 匹配
    gold_cited = sorted(
        r for r in gold_reg
        if r in cited_literal
        or ((art := _main_gmp_article(r)) is not None and art in cited_articles)
    )
    answer_grounding = {
        "cited_regs": sorted(cited_literal),
        "cited_articles": sorted(cited_articles),
        "cited_not_retrieved": sorted(cited_literal - retrieved_set),   # 引用字面REG却没检索到 → 幻觉嫌疑
        "cited_gold_hits": gold_cited,
        "grounding_recall": (len(gold_cited) / len(gold_reg)) if gold_reg else None,
    }

    detail: dict = {
        "measurable": bool(gold),
        "n_gold": len(gold), "n_retrieved": len(ranked),
        "hits": [], "recall": None, "precision": None,
        "mrr": None, "first_hit_rank": None, "recall_at_k": {},
        "answer_grounding": answer_grounding,
    }
    if not gold:
        return detail  # 无锚点 → 不可测

    hits = gold & retrieved_set
    detail["hits"] = sorted(hits)
    detail["recall"] = len(hits) / len(gold)
    # precision 分母用去重后的检索集合（sources 理应已按 reg_id/kp_id 去重；此处防御性去重更稳健）
    detail["precision"] = (len(hits) / len(retrieved_set)) if retrieved_set else 0.0
    rank = next((i for i, sid in enumerate(ranked, 1) if sid in gold), None)
    detail["first_hit_rank"] = rank
    detail["mrr"] = (1.0 / rank) if rank else 0.0
    for k in ks:
        detail["recall_at_k"][str(k)] = len(gold & set(ranked[:k])) / len(gold)
    return detail


def evaluate_one(record: dict, ask_fn=None) -> dict:
    """
    评测单条金标集记录。
    ask_fn: (question, edu_level) -> {"answer": str, "sources": list[str]}
    默认调用真实的 ask_tutor。
    """
    if ask_fn is None:
        from agents.tutor import ask_tutor
        ask_fn = lambda q, el: ask_tutor(q, edu_level=el)

    question = record["question"]
    edu_level = record.get("edu_level")
    answer_points = record.get("answer_points", [])

    t0 = time.monotonic()
    try:
        result = ask_fn(question, edu_level)
        answer = result.get("answer", "")
        sources = result.get("sources", [])
    except Exception as e:
        return {"id": record["id"], "error": str(e)}
    latency_ms = int((time.monotonic() - t0) * 1000)

    # 证据对齐：优先用生成答案时**实际使用**的 contexts（ask_tutor 现返回 contexts），
    # 避免二次 retrieve 拿到另一批文档给答案打分。仅当 ask_fn 未提供时才回退检索。
    contexts = result.get("contexts")
    if contexts is None:
        from rag.retriever import retrieve
        retrieved = retrieve(question, edu_level=edu_level, query_vec=None)
        contexts = [chunk.content for chunk in retrieved]

    # 点2：FF 打分对齐"模型真正看到的"压缩+重排上下文（gen_contexts）；
    # 没有则回退到检索原文。CP 仍用检索原文（衡量检索精度）。
    gen_contexts = result.get("gen_contexts")
    if gen_contexts:
        ff_contexts, ff_source = gen_contexts, "gen_contexts"
    else:
        ff_contexts, ff_source = contexts, "contexts"

    cp, cp_detail = _score_context_precision(question, contexts, answer_points)
    ff, ff_detail = _score_faithfulness(answer, ff_contexts)
    ar, ar_detail = _score_answer_relevance(question, answer)
    # 点5：确定性锚定检索指标（用 sources 与专家锚点，无 LLM）
    anchored = _score_anchored_retrieval(
        sources, record.get("expect_reg_ids"), record.get("expect_kp_ids"), answer)

    return {
        "id": record["id"],
        "question": question,
        "edu_level": edu_level,
        # 点1：保存完整答案 / 完整 contexts / 金标要点 / 全部 sources，供低分题严格追因
        "answer": answer,
        "answer_chars": len(answer or ""),
        "answer_points": answer_points,
        "sources": sources,
        "contexts": contexts,
        "n_contexts": len(contexts),
        # 点2：保存 gen_contexts 与 FF 实际打分所用的证据来源，供复盘
        "gen_contexts": gen_contexts or [],
        "ff_context_source": ff_source,
        # 点5：专家锚点 + 确定性锚定检索指标
        "expect_reg_ids": record.get("expect_reg_ids", []),
        "expect_kp_ids": record.get("expect_kp_ids", []),
        "anchored": anchored,
        "context_precision": round(cp, 3) if cp is not None else None,
        "faithfulness":       round(ff, 3) if ff is not None else None,
        "answer_relevance":   round(ar, 3) if ar is not None else None,
        # 点1：judge 逐条原始判断（复盘"哪条声明被判无支撑、为什么"）
        "judge_detail": {
            "context_precision": cp_detail,
            "faithfulness": ff_detail,
            "answer_relevance": ar_detail,
        },
        "latency_ms": latency_ms,
    }


# 配置快照要记录的键（点1：复盘时能还原当时的检索/生成/judge 配置）
_SNAPSHOT_KEYS = [
    "LLM_MODEL", "LLM_MODEL_SMALL", "LLM_MODEL_HEAVY", "RAGAS_JUDGE_MODEL",
    "RAG_TOP_K", "RAG_GRAPH_HOP", "RAG_THRESHOLD", "RAG_GRAPH_THRESHOLD", "RAG_FINAL_TOP_N",
    "RAG_RERANK_ENABLED", "RAG_RERANK_MODEL", "RAG_RERANK_TOP_BEFORE",
    "RAG_FUSION_VEC_WEIGHT", "RAG_FUSION_BM25_WEIGHT", "RAG_HYDE_ENABLED",
    "CTX_COMPRESS_ENABLED", "CTX_COMPRESS_RATIO",
    "SEMANTIC_CACHE_ENABLED", "COVE_ENABLED", "HISTORY_TURNS",
]


@contextlib.contextmanager
def _disable_semantic_cache(disable: bool = True):
    """点3：评测期间关闭 tutor 的语义缓存，保证每题都真实跑一遍（隔离、可复现）。
    退出（含异常）后恢复原值，不污染进程内后续状态。"""
    import agents.tutor as _tutor
    orig = _tutor.SEMANTIC_CACHE_ENABLED
    if disable:
        _tutor.SEMANTIC_CACHE_ENABLED = False
    try:
        yield orig
    finally:
        _tutor.SEMANTIC_CACHE_ENABLED = orig


def _build_run_meta(golden_path: str, n_requested: int | None,
                    golden_n_total: int, index_note: str,
                    cache_disabled: bool | None = None) -> dict:
    """点1：构造运行元数据——golden 内容哈希 + 配置快照 + 命令 + 索引状态 + 缓存隔离状态。
    纯函数（只读文件 + 读 config + sys.argv），可离线单测。"""
    import config as _cfg
    raw = Path(golden_path).read_bytes()
    snapshot = {k: getattr(_cfg, k, None) for k in _SNAPSHOT_KEYS}
    return {
        "timestamp": datetime.datetime.now().isoformat(timespec="seconds"),
        "eval_kind": "RAGAS-like（自写 LLM judge，非官方 ragas 包）",
        "golden_path": str(golden_path),
        "golden_sha256": hashlib.sha256(raw).hexdigest(),
        "golden_n_total": golden_n_total,
        "n_requested": n_requested,
        "command": " ".join(sys.argv),
        "index_state": index_note,
        "judge_model": RAGAS_JUDGE_MODEL,
        "thresholds": {
            "faithfulness": THRESHOLD_FAITHFULNESS,
            "context_precision": THRESHOLD_CONTEXT_PRECISION,
        },
        # 点3：本次评测是否关闭了语义缓存（config_default=配置默认值，供对照）
        "cache_isolation": {
            "disabled_for_eval": cache_disabled,
            "config_default": getattr(_cfg, "SEMANTIC_CACHE_ENABLED", None),
        },
        "config_snapshot": snapshot,
    }


def _summarize_anchored(valid: list[dict]) -> dict:
    """点5：把逐题锚定指标聚合成汇总。无可测题（专家未锚定）时给出提示，
    但仍报"答案引用可观测性"（引用条数 / 引用了却没检索到的条数，不依赖金标）。"""
    meas = [r["anchored"] for r in valid if r.get("anchored", {}).get("measurable")]

    def _has_cite(r):
        ag = r.get("anchored", {}).get("answer_grounding", {})
        return bool(ag.get("cited_regs") or ag.get("cited_articles"))

    n_with_cite = sum(1 for r in valid if _has_cite(r))
    n_cite_miss = sum(len(r["anchored"]["answer_grounding"].get("cited_not_retrieved", []))
                      for r in valid if r.get("anchored"))
    citation_obs = {"n_answers_with_citation": n_with_cite,
                    "n_cited_but_not_retrieved": n_cite_miss}
    if not meas:
        return {
            "n_measurable": 0,
            "note": "无题目含专家锚点（expect_reg_ids/kp_ids 均空）→ 检索命中率/证据锚定待专家锚定后可用",
            "answer_citation_observability": citation_obs,
        }

    def _mean(vals: list) -> float | None:
        vals = [v for v in vals if v is not None]
        return round(sum(vals) / len(vals), 3) if vals else None

    ks = sorted({k for a in meas for k in a["recall_at_k"]}, key=int)
    return {
        "n_measurable": len(meas),
        "recall":          _mean([a["recall"] for a in meas]),
        "precision":       _mean([a["precision"] for a in meas]),
        "mrr":             _mean([a["mrr"] for a in meas]),
        "recall_at_k":     {k: _mean([a["recall_at_k"][k] for a in meas]) for k in ks},
        "grounding_recall": _mean([a["answer_grounding"]["grounding_recall"] for a in meas]),
        "answer_citation_observability": citation_obs,
    }


def run_eval(n: int | None = None, output_path: str | None = None,
             disable_cache: bool = True) -> dict:
    """
    运行 RAGAS-风格评测（自写 judge），返回汇总结果。
    disable_cache=True（默认）：评测期间关闭语义缓存，保证每题真实跑、结果可复现。
    """
    fpath = Path(EVAL_GOLDEN_PATH)
    if not fpath.exists():
        print(f"[ERROR] 金标集文件不存在: {fpath}")
        sys.exit(1)

    records = []
    for line in fpath.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            records.append(json.loads(line))

    golden_n_total = len(records)  # 截断前的金标总题数（供 run_meta）
    if n is not None:
        records = records[:n]

    # 关键：独立进程默认不建向量索引（那是 FastAPI startup 的事），
    # 不建则 retrieve/ask_tutor 双双降级到关键词检索，评测的是稀疏链路而非真实向量链路。
    # 必须先 rebuild，否则 contexts 稀疏/为空 → CP=FF=0，基线不可信。
    try:
        import rag.vector_index as _vi
        _idx = _vi.rebuild()
        _index_note = f"已构建（{_idx.size} 向量）"
    except Exception as e:  # noqa: BLE001
        _index_note = f"构建失败，降级关键词检索：{e}"

    print(f"\n{'='*60}")
    print(f"  eval/ragas_eval.py  D3/D7 RAGAS-风格三维评测（自写 judge，非官方 ragas 包）")
    print(f"{'='*60}")
    print(f"  题数：{len(records)}（金标集共{len(records)}题）")
    print(f"  Judge LLM：{RAGAS_JUDGE_MODEL}")
    print(f"  向量索引：{_index_note}")
    print(f"  语义缓存：{'评测期已关闭（隔离）' if disable_cache else '保持开启'}")
    print()

    results = []
    with _disable_semantic_cache(disable_cache):
        for i, rec in enumerate(records):
            print(f"  [{i+1}/{len(records)}] {rec['id']} - {rec['question'][:40]}...")
            r = evaluate_one(rec)
            results.append(r)
            if "error" not in r:
                def _fmt(v): return f"{v:.3f}" if v is not None else "N/A"
                print(f"       CP={_fmt(r['context_precision'])}  "
                      f"FF={_fmt(r['faithfulness'])}  "
                      f"AR={_fmt(r['answer_relevance'])}  "
                      f"latency={r['latency_ms']}ms")
            else:
                print(f"       ERROR: {r['error']}")

    # 汇总
    valid = [r for r in results if "error" not in r]
    if not valid:
        print("\n  无有效结果，请检查错误。")
        return {}

    def _avg(key: str) -> float | None:
        vals = [r[key] for r in valid if r.get(key) is not None]
        return sum(vals) / len(vals) if vals else None

    avg_cp = _avg("context_precision")
    avg_ff = _avg("faithfulness")
    avg_ar = _avg("answer_relevance")

    n_cp_failed = sum(1 for r in valid if r.get("context_precision") is None)
    n_ff_failed = sum(1 for r in valid if r.get("faithfulness") is None)
    n_ar_failed = sum(1 for r in valid if r.get("answer_relevance") is None)

    summary = {
        "run_meta": _build_run_meta(str(fpath), n, golden_n_total, _index_note,
                                    cache_disabled=disable_cache),
        "n_evaluated": len(valid),
        "n_judge_failed": {
            "context_precision": n_cp_failed,
            "faithfulness": n_ff_failed,
            "answer_relevance": n_ar_failed,
        },
        "context_precision": round(avg_cp, 3) if avg_cp is not None else None,
        "faithfulness":       round(avg_ff, 3) if avg_ff is not None else None,
        "answer_relevance":   round(avg_ar, 3) if avg_ar is not None else None,
        "anchored_summary": _summarize_anchored(valid),   # 点5：确定性锚定检索指标
        "details": results,
    }

    # 输出三维分表
    print(f"\n{'='*60}")
    print(f"  三维分表（n={len(valid)}，Judge失败：CP={n_cp_failed} FF={n_ff_failed} AR={n_ar_failed}）")
    print(f"{'='*60}")
    print(f"  {'指标':<22}  {'均值':>8}  {'红线':>8}  {'状态':>8}")
    print(f"  {'-'*50}")

    def _line(name, val, threshold, diag_key):
        if val is None:
            print(f"  {name:<22}  {'N/A':>8}  {threshold:>8.2f}  {'[SKIP]':>8}")
            return
        status = "[PASS]" if val >= threshold else "[FAIL]"
        diag = f"\n    --> {DIAGNOSIS[diag_key]}" if val < threshold else ""
        print(f"  {name:<22}  {val:>8.3f}  {threshold:>8.2f}  {status:>8}{diag}")

    _line("Context Precision",  avg_cp, THRESHOLD_CONTEXT_PRECISION, "context_precision")
    _line("Faithfulness",       avg_ff, THRESHOLD_FAITHFULNESS,       "faithfulness")
    _line("Answer Relevance",   avg_ar, 0.0,                          "answer_relevance")

    # 点5：确定性锚定检索指标分区
    _anc = summary["anchored_summary"]
    print(f"\n{'='*60}")
    print(f"  确定性锚定检索指标（无 LLM judge，需专家锚点）")
    print(f"{'='*60}")
    if _anc["n_measurable"] == 0:
        print(f"  {_anc['note']}")
    else:
        rk = "  ".join(f"@{k}={v}" for k, v in _anc["recall_at_k"].items())
        print(f"  可测题数：{_anc['n_measurable']}/{len(valid)}")
        print(f"  Recall={_anc['recall']}  Precision={_anc['precision']}  MRR={_anc['mrr']}  ({rk})")
        print(f"  答案证据锚定 grounding_recall={_anc['grounding_recall']}")
    _cobs = _anc["answer_citation_observability"]
    print(f"  答案引用观测：{_cobs['n_answers_with_citation']}/{len(valid)} 题有引用，"
          f"其中引用了却未检索到 {_cobs['n_cited_but_not_retrieved']} 处（幻觉嫌疑）")

    overall_pass = (
        avg_ff is not None and avg_ff >= THRESHOLD_FAITHFULNESS and
        avg_cp is not None and avg_cp >= THRESHOLD_CONTEXT_PRECISION
    )
    print(f"\n{'='*60}")
    print(f"  D3: {'PASS' if overall_pass else 'FAIL（见上方整改建议）'}")
    print(f"{'='*60}\n")

    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        print(f"  详细结果已保存到: {output_path}")

    return summary


def main():
    parser = argparse.ArgumentParser(description="RAGAS-风格三维评测（自写 judge，非官方 ragas 包）")
    parser.add_argument("--n", type=int, default=None, help="评测前N题（默认全部）")
    parser.add_argument("--out", type=str, default=None, help="输出 JSON 路径")
    parser.add_argument("--keep-cache", action="store_true",
                        help="保持语义缓存开启（默认评测期关闭以隔离）")
    args = parser.parse_args()
    run_eval(n=args.n, output_path=args.out, disable_cache=not args.keep_cache)


if __name__ == "__main__":
    main()
