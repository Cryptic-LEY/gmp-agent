# -*- coding: utf-8 -*-
"""
上下文压缩模块（02-context-perf）

职责：
  1. 硬约束提取与锁定（日期 / 数字+单位 / 否定词组）
  2. 句级抽取式压缩（保留 ratio 比例句子，约束句强制保留）
  3. 压缩后校验 — 任意约束丢失则无损回退
  4. 头尾重组 — 最高分在首，次高分在末，规避 lost-in-the-middle
"""
from __future__ import annotations

import math
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from rag.retriever import DocChunk

from config import CTX_COMPRESS_ENABLED

# ── 硬约束正则 ────────────────────────────────────────────────────────────────

_DATE_RE = re.compile(
    r'\d{4}年(?:\d{1,2}月(?:\d{1,2}日)?)?'
)

_NUM_UNIT_RE = re.compile(
    r'[±]?\d+(?:\.\d+)?(?:\s*)(?:'
    r'mg/kg|μg/kg|mg/L|g/L|mL/min|CFU/m[²³]|'
    r'°C|℃|°F|℉|%|μg|ppb|ppm|CFU|kPa|MPa|Pa|'
    r'μm|nm|m²|m³|'
    r'mg|g|kg|mL|L|h|min'
    r')'
)

# 否定词组：停在句末标点前（最多匹配15个非标点字符）
_NEGATION_RE = re.compile(
    r'(?:不予|不得|禁止|严禁|不能|不可)[^，。！？；\s]{0,15}'
)

_HARD_PATTERNS = [_DATE_RE, _NUM_UNIT_RE, _NEGATION_RE]

# 句子分隔符
_SENT_SPLIT_RE = re.compile(r'([。！？；\n]+)')


# ── 公开 API ──────────────────────────────────────────────────────────────────

def extract_hard_constraints(text: str) -> list[str]:
    """提取硬约束 token：日期、数字+单位、否定词组。"""
    found: list[str] = []
    seen: set[str] = set()
    for pat in _HARD_PATTERNS:
        for m in pat.findall(text):
            if m not in seen:
                seen.add(m)
                found.append(m)
    return found


def check_constraints_preserved(original: str, compressed: str, constraints: list[str]) -> bool:
    """校验所有硬约束 token 在压缩后文本中 100% 保留。"""
    return all(c in compressed for c in constraints)


def compress_chunk(text: str, ratio: float = 0.5) -> str:
    """
    压缩单个文本块。
    - CTX_COMPRESS_ENABLED=False → 原文返回
    - ratio=0.0 → 极限压缩，若约束丢失则原文回退
    - 约束句强制保留，其余按 ratio 从文档头部填充
    """
    if not CTX_COMPRESS_ENABLED:
        return text

    constraints = extract_hard_constraints(text)
    compressed = _extractive(text, ratio, constraints)

    if not compressed or (
        constraints and not check_constraints_preserved(text, compressed, constraints)
    ):
        return text  # 无损回退

    return compressed


def reorder_for_llm(chunks: list[DocChunk]) -> list[DocChunk]:
    """
    头尾重组，规避 lost-in-the-middle：
      [最高分reg/kp] + [其余 ↓分数] + [第二高分reg/kp] + [experience（始终末尾）]

    经验条（doc_type='experience'）量纲不同（0.5x），不参与重组竞争，固定置末。
    ≤2 块非经验条时保持原序。
    """
    exp  = [c for c in chunks if c.doc_type == 'experience']
    main = [c for c in chunks if c.doc_type != 'experience']

    if len(main) <= 2:
        return list(main) + exp

    by_score = sorted(main, key=lambda c: c.score, reverse=True)
    head   = by_score[0]
    second = by_score[1]
    middle = by_score[2:]
    return [head] + middle + [second] + exp


# ── 内部实现 ──────────────────────────────────────────────────────────────────

def _split_sentences(text: str) -> list[str]:
    """按中文句末标点切句，保留标点。"""
    parts = _SENT_SPLIT_RE.split(text)
    sentences: list[str] = []
    i = 0
    while i < len(parts):
        content = parts[i].strip()
        delim   = parts[i + 1] if i + 1 < len(parts) else ""
        if content:
            sentences.append(content + delim.rstrip())
        i += 2
    if not sentences and text.strip():
        sentences = [text.strip()]
    return sentences


def _extractive(text: str, ratio: float, constraints: list[str]) -> str:
    """
    句级抽取式压缩：
      - 含硬约束的句子强制保留（must_keep）
      - 剩余预算从文档头部顺序填充
    """
    sentences = _split_sentences(text)
    if not sentences:
        return ""

    keep_n = math.ceil(len(sentences) * ratio) if ratio > 0 else 0

    must_keep: set[int] = set()
    for idx, sent in enumerate(sentences):
        if any(c in sent for c in constraints):
            must_keep.add(idx)

    selected = sorted(must_keep)
    remaining = [i for i in range(len(sentences)) if i not in must_keep]
    extra = max(0, keep_n - len(selected))
    selected = sorted(selected + remaining[:extra])

    return "".join(sentences[i] for i in selected)
