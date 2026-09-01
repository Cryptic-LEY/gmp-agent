"""
MCQ 客观准确率评测：单选/多选/判断（专家题库 505 题）。

与 ragas_eval.py 的关键区别：
  - 打分是**确定性精确匹配**（字母集合相等 → 对/错），无 LLM judge、无自评循环。
  - 因此这是比 RAGAS 更"硬"的正确性信号，专治"AI 出题+AI 答题+AI 评分"的循环性质疑。

评测对象：RAG 系统在 GMP 选择题上的答题正确率。
  每题：先 retrieve() 拿法规上下文做接地 → 让答题模型只输出字母 → 与金标精确比对。

用法：
  cd gmp-api
  python -m eval.mcq_eval                 # 全量 505 题
  python -m eval.mcq_eval --n 50          # 先跑前 50 题试点（省 DashScope）
  python -m eval.mcq_eval --type single   # 只跑单选/multi/judge
  python -m eval.mcq_eval --out result.json

注：解析与打分是纯函数（parse_model_answer / score_one），可离线单测，不需网络。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import collections
from pathlib import Path

from config import LLM_BASE_URL, LLM_API_KEY, RAGAS_JUDGE_MODEL

# 答题模型：复用 heavy 模型（与 tutor 生成同一档 qwen-max）。
ANSWER_MODEL = RAGAS_JUDGE_MODEL
MCQ_BANK_PATH = Path(__file__).parent / "mcq_bank.jsonl"

TYPE_CN = {"single": "单选题", "multi": "多选题", "judge": "判断题"}


# ── 纯函数：解析与打分（可离线单测，无网络） ──────────────────────────────────
_LABEL_PREFIX = re.compile(r"^(?:正确答案|答案|ANSWER|选择|应选|选)[是为:：\s]*", re.I)
# 一段"连续答案字母"：字母之间只允许空白/顿号/逗号/和及，遇到中文或句号即停。
_LETTER_RUN = re.compile(r"[A-G](?:[\s、,，和及]*[A-G])*")


def parse_model_answer(text: str, valid_letters: set[str]) -> str:
    """从模型输出里抽取答案字母集合，归一化为排序去重大写字母串。

    策略：答案通常先给字母再解释，所以取"第一段连续字母"，而非全文所有字母
    （否则 '答案是B。因为A错误' 会被误抓成 AB）。仅保留该题实际选项内的字母。
    """
    if not text:
        return ""
    t = _LABEL_PREFIX.sub("", text.strip().upper())  # 剥离"答案是/正确答案："等前缀
    m = _LETTER_RUN.match(t)                          # 优先取开头的连续字母段
    if not m:
        m = _LETTER_RUN.search(t)                     # 开头是中文（"这题选B"）→ 取首个字母段
    if not m:
        return ""
    letters = [c for c in m.group(0) if c in valid_letters]
    return "".join(sorted(set(letters)))


def score_one(pred: str, gold: str, qtype: str) -> tuple[bool, float]:
    """返回 (是否精确正确, Jaccard 部分分)。
    精确正确 = 预测字母集合 == 金标字母集合（主指标）。
    Jaccard = 交/并（诊断用，多选题看"接近程度"）。"""
    ps, gs = set(pred), set(gold)
    exact = (ps == gs) and len(gs) > 0
    union = ps | gs
    jaccard = (len(ps & gs) / len(union)) if union else 0.0
    return exact, jaccard


def build_prompt(record: dict, contexts: list[str]) -> str:
    qtype = record["type"]
    type_hint = {
        "single": "单选题（有且仅有一个正确选项）",
        "multi":  "多选题（两个或以上正确选项）",
        "judge":  "判断题（A=正确，B=错误，只选一个）",
    }.get(qtype, "选择题")
    opts = record["options"]
    opt_lines = "\n".join(f"{k}. {opts[k]}" for k in sorted(opts))
    ctx = "\n---\n".join(c[:500] for c in contexts[:5]) if contexts else "（无检索资料，凭专业知识作答）"
    return (
        "你是 GMP（药品生产质量管理规范）考试答题助手。请依据参考资料与专业知识作答。\n\n"
        f"【题型】{type_hint}\n\n"
        f"【参考资料】\n{ctx}\n\n"
        f"【题目】{record['question']}\n"
        f"【选项】\n{opt_lines}\n\n"
        "【输出要求】只输出答案字母，多选按字母顺序连写（如 ABD）。"
        "不要输出任何解释、标点或多余文字。"
    )


def _llm_answer(prompt: str) -> str:
    import httpx
    resp = httpx.post(
        f"{LLM_BASE_URL}/chat/completions",
        headers={"Authorization": f"Bearer {LLM_API_KEY}"},
        json={
            "model": ANSWER_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.0,
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def answer_one(record: dict, ask_fn=None) -> dict:
    """回答单题并打分。ask_fn(record, contexts)->str 可注入用于离线测试。"""
    try:  # 记录字段缺失也记为 error 而非中断整轮评测
        question = record["question"]
        valid = set(record["options"].keys())
    except (KeyError, AttributeError, TypeError) as e:
        return {"id": record.get("id", "?"), "error": f"记录字段缺失: {e}"}

    # 检索接地（与 ragas_eval 一致：独立进程需先 rebuild 索引，见 run）
    try:
        from rag.retriever import retrieve
        retrieved = retrieve(question, edu_level=None, query_vec=None)
        contexts = [c.content for c in retrieved]
    except Exception:
        contexts = []

    t0 = time.monotonic()
    try:
        raw = ask_fn(record, contexts) if ask_fn else _llm_answer(build_prompt(record, contexts))
    except Exception as e:
        return {"id": record["id"], "error": str(e)}
    latency_ms = int((time.monotonic() - t0) * 1000)

    pred = parse_model_answer(raw, valid)
    exact, jaccard = score_one(pred, record["answer"], record["type"])
    return {
        "id": record["id"],
        "type": record["type"],
        "difficulty": record.get("difficulty", ""),
        "gold": record["answer"],
        "pred": pred,
        "raw": raw.strip()[:60],
        "correct": exact,
        "jaccard": round(jaccard, 3),
        "latency_ms": latency_ms,
    }


def run_mcq_eval(n: int | None = None, qtype: str | None = None,
                 output_path: str | None = None) -> dict:
    if not MCQ_BANK_PATH.exists():
        print(f"[ERROR] 题库不存在: {MCQ_BANK_PATH}")
        sys.exit(1)

    records = []
    for line in MCQ_BANK_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            r = json.loads(line)
            if qtype and r["type"] != qtype:
                continue
            records.append(r)
    if n is not None:
        records = records[:n]

    # 与 ragas_eval 同：独立进程必须先建向量索引，否则 retrieve 降级关键词 → 接地变差。
    try:
        import rag.vector_index as _vi
        _idx = _vi.rebuild()
        index_note = f"已构建（{_idx.size} 向量）"
    except Exception as e:  # noqa: BLE001
        index_note = f"构建失败，降级关键词检索：{e}"

    print(f"\n{'='*60}")
    print(f"  eval/mcq_eval.py  选择题客观准确率评测（确定性打分）")
    print(f"{'='*60}")
    print(f"  题数：{len(records)}" + (f"（仅 {TYPE_CN.get(qtype, qtype)}）" if qtype else ""))
    print(f"  答题模型：{ANSWER_MODEL}")
    print(f"  向量索引：{index_note}\n")

    results = []
    for i, rec in enumerate(records):
        r = answer_one(rec)
        results.append(r)
        if "error" not in r:
            flag = "✓" if r["correct"] else "✗"
            print(f"  [{i+1}/{len(records)}] {r['id']} {r['type']:6s} "
                  f"金标={r['gold']:5s} 预测={r['pred']:5s} {flag}  {r['latency_ms']}ms")
        else:
            print(f"  [{i+1}/{len(records)}] {rec['id']} ERROR: {r['error']}")

    # ── 汇总 ──
    valid = [r for r in results if "error" not in r]
    summary = _summarize(valid)
    _print_summary(summary, len(results), len(valid))

    payload = {"summary": summary, "results": results}
    if output_path:
        Path(output_path).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n  详细结果已保存: {output_path}")
    return payload


def _summarize(valid: list[dict]) -> dict:
    def acc(rows):
        return round(sum(r["correct"] for r in rows) / len(rows), 4) if rows else None
    by_type, by_diff = {}, {}
    for t in ("single", "multi", "judge"):
        rows = [r for r in valid if r["type"] == t]
        if rows:
            by_type[t] = {"n": len(rows), "accuracy": acc(rows),
                          "mean_jaccard": round(sum(r["jaccard"] for r in rows) / len(rows), 3)}
    for d in sorted({r["difficulty"] for r in valid if r["difficulty"]}):
        rows = [r for r in valid if r["difficulty"] == d]
        by_diff[d] = {"n": len(rows), "accuracy": acc(rows)}
    return {
        "overall_accuracy": acc(valid),
        "n_total": len(valid),
        "n_correct": sum(r["correct"] for r in valid),
        "by_type": by_type,
        "by_difficulty": by_diff,
        "mean_jaccard_multi": round(
            sum(r["jaccard"] for r in valid if r["type"] == "multi") /
            max(1, sum(1 for r in valid if r["type"] == "multi")), 3),
    }


def _print_summary(s: dict, n_total: int, n_valid: int) -> None:
    print(f"\n{'='*60}\n  汇总（有效 {n_valid}/{n_total}）\n{'='*60}")
    print(f"  总体精确准确率: {s['overall_accuracy']}  ({s['n_correct']}/{s['n_total']})")
    print("  分题型:")
    for t, v in s["by_type"].items():
        extra = f"  多选平均Jaccard={v['mean_jaccard']}" if t == "multi" else ""
        print(f"    {TYPE_CN[t]}: {v['accuracy']}  (n={v['n']}){extra}")
    print("  分难度:")
    for d, v in s["by_difficulty"].items():
        print(f"    {d}: {v['accuracy']}  (n={v['n']})")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=None, help="只评测前 N 题")
    ap.add_argument("--type", choices=["single", "multi", "judge"], default=None)
    ap.add_argument("--out", type=str, default=None)
    args = ap.parse_args()
    run_mcq_eval(n=args.n, qtype=args.type, output_path=args.out)


if __name__ == "__main__":
    main()
