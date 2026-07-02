"""
D3/D7 RAGAS 三维评测：Context Precision / Faithfulness / Answer Relevance。

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
import json
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
    """调 DashScope 作为 RAGAS judge LLM。"""
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
) -> float | None:
    """
    Context Precision: 检索到的 contexts 中，与 answer_points 相关的比例。
    用 LLM 判断每个 context 是否有助于回答该问题。
    LLM 异常时跳过该 context（不算不相关），全部失败时返回 None。
    """
    if not contexts:
        return 0.0
    relevant = 0
    n_judged = 0
    for ctx in contexts:
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
            if res.strip().upper().startswith("YES"):
                relevant += 1
        except Exception:
            pass  # judge 失败时跳过该 context，不当成不相关
    if n_judged == 0:
        return None  # 所有 LLM 调用都失败
    return relevant / n_judged


def _score_faithfulness(
    answer: str, contexts: list[str]
) -> float | None:
    """
    Faithfulness: 答案中的声明有多少比例有 context 支撑。
    先让 LLM 分解声明，再逐条判断。
    contexts/answer 为空 → 0.0；解析失败或异常 → None（评测失败，不混入平均值）。
    """
    if not contexts or not answer:
        return 0.0
    ctx_text = "\n".join(contexts[:5])
    prompt = (
        f"参考资料：\n{ctx_text[:2000]}\n\n"
        f"待评估答案：\n{answer[:1000]}\n\n"
        "请列出答案中的关键事实声明（每行一条，最多8条）。\n"
        "然后对每条声明判断：参考资料是否支持？格式：声明 | YES/NO\n"
        "只输出声明判断列表，不要其他内容。"
    )
    try:
        res = _llm(prompt)
        lines = [l.strip() for l in res.strip().splitlines() if "|" in l]
        if not lines:
            return None  # judge 输出无法解析
        supported = sum(1 for l in lines if l.split("|")[-1].strip().upper() == "YES")
        return supported / len(lines)
    except Exception:
        return None  # LLM 调用失败


def _score_answer_relevance(question: str, answer: str) -> float | None:
    """
    Answer Relevance: 答案对问题的相关程度。
    让 LLM 根据答案反推问题，看与原问题的语义匹配度。
    answer 为空 → 0.0；解析失败或异常 → None（不再返回 0.5 偏向值）。
    """
    if not answer:
        return 0.0
    prompt = (
        f"以下是一个问答对：\n\n"
        f"问题：{question}\n"
        f"答案：{answer[:800]}\n\n"
        "该答案是否直接回答了问题？评分1-10（10=完全相关），只输出数字。"
    )
    try:
        res = _llm(prompt)
        score = float(res.strip().split()[0])
        return min(max(score / 10.0, 0.0), 1.0)
    except Exception:
        return None  # judge 失败，不用 0.5 偏向值


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

    cp = _score_context_precision(question, contexts, answer_points)
    ff = _score_faithfulness(answer, contexts)
    ar = _score_answer_relevance(question, answer)

    return {
        "id": record["id"],
        "question": question,
        "answer": answer[:200],
        "context_precision": round(cp, 3) if cp is not None else None,
        "faithfulness":       round(ff, 3) if ff is not None else None,
        "answer_relevance":   round(ar, 3) if ar is not None else None,
        "latency_ms": latency_ms,
        "sources": sources[:5],
    }


def run_eval(n: int | None = None, output_path: str | None = None) -> dict:
    """
    运行 RAGAS 评测，返回汇总结果。
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

    if n:
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
    print(f"  eval/ragas_eval.py  D3/D7 RAGAS 三维评测")
    print(f"{'='*60}")
    print(f"  题数：{len(records)}（金标集共{len(records)}题）")
    print(f"  Judge LLM：{RAGAS_JUDGE_MODEL}")
    print(f"  向量索引：{_index_note}")
    print()

    results = []
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
        "n_evaluated": len(valid),
        "n_judge_failed": {
            "context_precision": n_cp_failed,
            "faithfulness": n_ff_failed,
            "answer_relevance": n_ar_failed,
        },
        "context_precision": round(avg_cp, 3) if avg_cp is not None else None,
        "faithfulness":       round(avg_ff, 3) if avg_ff is not None else None,
        "answer_relevance":   round(avg_ar, 3) if avg_ar is not None else None,
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
    parser = argparse.ArgumentParser(description="RAGAS 三维评测")
    parser.add_argument("--n", type=int, default=None, help="评测前N题（默认全部）")
    parser.add_argument("--out", type=str, default=None, help="输出 JSON 路径")
    args = parser.parse_args()
    run_eval(n=args.n, output_path=args.out)


if __name__ == "__main__":
    main()
