# -*- coding: utf-8 -*-
"""critic_ablation 的确定性指标与解析（纯函数，可离线单测）。

对应规格 04-critic-cove-ablation.md §7 / §13 / §16。
本模块只做确定性计算与解析；LLM Judge、配对 bootstrap/McNemar 等在
harness 与后续阶段接入。所有函数对空 gold / 空输入返回 None 而非 0，
避免把"不可测"误报成"零命中/零违反"（§7.10、§13.1）。
"""
from __future__ import annotations

import hashlib
import random
import re
import unicodedata
from math import comb

# ── SHA ─────────────────────────────────────────────────────────────────────
def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


# ── §7 数据集契约 ────────────────────────────────────────────────────────────
DATASET_REQUIRED_IDS: list[str] = [f"EQ-{i:03d}" for i in range(1, 39)]


def validate_dataset(records: list[dict]) -> list[str]:
    """校验金标集是否满足 §7 契约（schema 层，DB 存在性检查在 harness 预检）。

    返回违规描述列表；空列表表示通过。
    """
    violations: list[str] = []

    if len(records) != 38:
        violations.append(f"记录数应为 38，实为 {len(records)}")

    ids = [r.get("id") for r in records]
    id_set = set(ids)
    if len(ids) != len(id_set):
        dups = sorted({x for x in ids if ids.count(x) > 1})
        violations.append(f"存在重复 id: {dups}")
    missing = sorted(set(DATASET_REQUIRED_IDS) - id_set)
    extra = sorted(id_set - set(DATASET_REQUIRED_IDS))
    if missing:
        violations.append(f"缺少 id: {missing[:5]}{'...' if len(missing) > 5 else ''}")
    if extra:
        violations.append(f"出现非法 id（应为 EQ-001..EQ-038）: {extra[:5]}{'...' if len(extra) > 5 else ''}")

    for r in records:
        rid = r.get("id", "<无id>")
        if r.get("annotator") != "expert":
            violations.append(f"{rid} annotator 非 expert: {r.get('annotator')!r}")
        if not (isinstance(r.get("question"), str) and r["question"].strip()):
            violations.append(f"{rid} question 为空或非字符串")
        ap = r.get("answer_points")
        if not (isinstance(ap, list) and len(ap) > 0):
            violations.append(f"{rid} answer_points 为空或非 list")
        if not isinstance(r.get("expect_reg_ids"), list):
            violations.append(f"{rid} expect_reg_ids 类型错误（应为 list）")
        if not isinstance(r.get("expect_kp_ids"), list):
            violations.append(f"{rid} expect_kp_ids 类型错误（应为 list）")

    return violations


# ── 文本规范化 ───────────────────────────────────────────────────────────────
_WS_RE = re.compile(r"\s+")


def nfc_normalize(s: str) -> str:
    """Unicode NFC + 折叠所有空白 + 首尾去空白（§13.2 quote 规范化口径）。"""
    if not s:
        return ""
    s = unicodedata.normalize("NFC", s)
    return _WS_RE.sub("", s.strip())


# ── §13.1 检索指标 ───────────────────────────────────────────────────────────
def _dedup_keep_order(ids: list[str]) -> list[str]:
    return list(dict.fromkeys(ids))


def recall_at_k(retrieved_ids: list[str], gold_ids, k: int) -> float | None:
    """命中的金标 id 数 / 金标 id 数；gold 为空 → None（不可测，非 0）。"""
    gold = set(gold_ids)
    if not gold:
        return None
    topk = set(_dedup_keep_order(retrieved_ids)[:k])
    return len(gold & topk) / len(gold)


def first_hit_rank(retrieved_ids: list[str], gold_ids) -> int | None:
    """首个命中金标的 1-based 排名；无命中 → None。"""
    gold = set(gold_ids)
    if not gold:
        return None
    for i, rid in enumerate(_dedup_keep_order(retrieved_ids), start=1):
        if rid in gold:
            return i
    return None


def mrr(retrieved_ids: list[str], gold_ids) -> float | None:
    """单查询倒数排名：命中→1/rank，未命中但 gold 非空→0.0，gold 空→None。"""
    gold = set(gold_ids)
    if not gold:
        return None
    rank = first_hit_rank(retrieved_ids, gold)
    return 1.0 / rank if rank else 0.0


# ── §13.2 引用解析 & 内部 ID 泄漏 ────────────────────────────────────────────
_CITE_RE = re.compile(
    r"【条款编号】\s*(?P<article>.*?)\s*"
    r"【来源】\s*(?P<source>.*?)\s*"
    r"【原文内容】\s*(?P<content>.*?)"
    r"(?=【条款编号】|\Z)",
    re.S,
)

_INTERNAL_ID_RE = re.compile(r"(?:REG|KP)-[A-Z0-9][A-Z0-9\-]*")


def parse_citation_blocks(answer: str) -> list[dict]:
    """解析答案中的 【条款编号】/【来源】/【原文内容】 三元组。

    返回 [{"article","source","content"}]；无引用块 → []。
    """
    if not answer:
        return []
    blocks: list[dict] = []
    for m in _CITE_RE.finditer(answer):
        blocks.append({
            "article": m.group("article").strip(),
            "source": m.group("source").strip(),
            "content": m.group("content").strip(),
        })
    return blocks


def count_internal_id_leaks(answer: str) -> int:
    """答案中出现 REG-/KP- 内部编号的次数（§13.2 internal_id_leak_count）。"""
    if not answer:
        return 0
    return len(_INTERNAL_ID_RE.findall(answer))


# ── §13.3 要点字面覆盖（确定性下界）──────────────────────────────────────────
_ENUM_PREFIX_RE = re.compile(r"^[\s0-9]*[.、)）]?\s*")
_COLON_SPLIT_RE = re.compile(r"[：:]")


def _point_key(point: str) -> str:
    """取要点的关键短语：优先冒号前的概念标签，去掉序号前缀后 NFC 规范化。"""
    if not point:
        return ""
    head = _COLON_SPLIT_RE.split(point, 1)[0]
    head = _ENUM_PREFIX_RE.sub("", head)
    key = nfc_normalize(head)
    # 标签过短（如"1"）时退回整条要点，避免假命中
    return key if len(key) >= 4 else nfc_normalize(_ENUM_PREFIX_RE.sub("", point))


def literal_point_coverage(answer: str, answer_points: list[str]) -> float | None:
    """金标要点关键短语能在答案中直接匹配的比例（确定性下界）。

    要点为空 → None。这是保守下界：只认字面子串命中，语义覆盖由 Judge 另算。
    """
    if not answer_points:
        return None
    a = nfc_normalize(answer)
    hit = 0
    for p in answer_points:
        key = _point_key(p)
        if key and key in a:
            hit += 1
    return hit / len(answer_points)


def citation_format_valid_rate(answer: str) -> float | None:
    """三字段齐全的引用尝试比例；完全没有引用标记 → None（§13.2）。

    分母按三类字段标记的最大出现次数计，避免缺少某个字段标记的畸形引用
    被正则解析器直接遗漏、从而虚高合规率。
    """
    marker_counts = (
        (answer or "").count("【条款编号】"),
        (answer or "").count("【来源】"),
        (answer or "").count("【原文内容】"),
    )
    attempts = max(marker_counts, default=0)
    if not attempts:
        return None
    blocks = parse_citation_blocks(answer)
    valid = sum(1 for b in blocks if b["article"] and b["source"] and b["content"])
    return valid / attempts


# ── §13.10 分位数（Hyndman–Fan Type 7 = numpy method="linear"）────────────────
def percentile_hf7(values, p: float) -> float | None:
    xs = sorted(v for v in values if v is not None)
    if not xs:
        return None
    if len(xs) == 1:
        return float(xs[0])
    h = (len(xs) - 1) * (p / 100.0)
    lo = int(h)
    frac = h - lo
    if lo + 1 < len(xs):
        return float(xs[lo] + frac * (xs[lo + 1] - xs[lo]))
    return float(xs[lo])


# ── §16 配对统计 ─────────────────────────────────────────────────────────────
def mcnemar_exact(b: int, c: int) -> float:
    """McNemar 精确检验（二项 p=0.5 双侧）。b/c 为两方向的不一致对数。"""
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    tail = sum(comb(n, i) for i in range(0, k + 1)) / (2 ** n)
    return min(1.0, 2 * tail)


def paired_bootstrap_ci(diffs, iters: int = 10000, seed: int = 0,
                        alpha: float = 0.05) -> tuple[float | None, float | None]:
    """逐题配对差值的均值 bootstrap 置信区间（固定种子可复现）；空输入 → (None, None)。"""
    xs = [d for d in diffs if d is not None]
    if not xs:
        return (None, None)
    rng = random.Random(seed)
    n = len(xs)
    means = []
    for _ in range(iters):
        means.append(sum(xs[rng.randrange(n)] for _ in range(n)) / n)
    means.sort()
    lo = means[int((alpha / 2) * iters)]
    hi = means[min(iters - 1, int((1 - alpha / 2) * iters))]
    return (lo, hi)
