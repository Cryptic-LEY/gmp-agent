# -*- coding: utf-8 -*-
"""
01-vector-engine 子任务1：small-to-big 语义分块单测。

验收点（对应 specs/rag-agent-upgrade/01-vector-engine.md §4.1）：
  - 按句界切分，禁止固定字符硬切（不切碎句子）
  - small 块 ~300、big 块 ~1800，small 映射到所属 big
  - 相邻 small 块有重叠（防边界信息丢失）
"""
import re

from rag.chunker import chunk_text, Chunk

# 每句 ~50 字、以。结尾、句内无其它句界符，便于精确断言
SENTS = [
    f"第{i}条规定药品生产企业应当建立健全质量管理体系并持续改进以确保药品质量安全有效可控。"
    for i in range(1, 21)
]
TEXT = "".join(SENTS)


def _split(s: str) -> list[str]:
    """把一段文本按句界还原成句子列表（保留句末标点）。"""
    return [p for p in re.findall(r"[^。！？；\n]*[。！？；\n]", s) if p.strip()]


def test_empty_text_returns_empty():
    assert chunk_text("") == []
    assert chunk_text("   \n  ") == []


def test_short_text_is_single_chunk():
    t = "洁净区分为A级B级C级D级四个空气洁净度等级。"
    chunks = chunk_text(t, small=300, big=1800)
    assert len(chunks) == 1
    assert chunks[0].small_text == t
    assert chunks[0].big_text == t
    assert chunks[0].seq == 0


def test_no_sentence_is_split_midway():
    """每个 small 块只能由完整句子组成，不能出现半截句子。"""
    chunks = chunk_text(TEXT, small=120, big=600)
    assert len(chunks) > 1
    for c in chunks:
        for sent in _split(c.small_text):
            assert sent in SENTS, f"出现被切碎的句子片段: {sent!r}"


def test_each_small_maps_into_its_big():
    """small 块内容必须包含在它所属的 big 块里（small-to-big 映射）。"""
    chunks = chunk_text(TEXT, small=120, big=600)
    for c in chunks:
        for sent in _split(c.small_text):
            assert sent in c.big_text
        assert len(c.big_text) >= len(c.small_text)


def test_consecutive_small_chunks_overlap():
    """同一 big 内相邻 small 块应共享句子（重叠缓冲）。"""
    from collections import defaultdict

    chunks = chunk_text(TEXT, small=120, big=600, overlap=50)
    groups: dict[str, list[str]] = defaultdict(list)
    for c in chunks:
        groups[c.big_text].append(c.small_text)

    saw_overlap = False
    for smalls in groups.values():
        for a, b in zip(smalls, smalls[1:]):
            if set(_split(a)) & set(_split(b)):
                saw_overlap = True
    assert saw_overlap, "相邻 small 块之间没有任何重叠句子"


def test_big_chunk_not_wildly_oversized():
    """big 块不超过 big + 最长单句（不切句导致的合理溢出容差）。"""
    chunks = chunk_text(TEXT, small=120, big=600)
    longest = max(len(s) for s in SENTS)
    for c in chunks:
        assert len(c.big_text) <= 600 + longest
