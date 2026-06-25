"""
small-to-big 语义分块（01-vector-engine 子任务1）。

按句界切分，禁止固定字符硬切：
  - 小块（~300字，单一知识点）入向量索引做精准定位
  - 大块（~1800字，含完整上下文）存库做充分生成，小块映射到所属大块
  - 相邻小块按 overlap 重叠几句，防边界信息丢失
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# 句界：中文句末标点 + 换行。findall 保留标点，避免切碎句子。
_SENT_RE = re.compile(r"[^。！？；\n]*[。！？；\n]")


@dataclass
class Chunk:
    seq: int          # 全局递增序号
    small_text: str   # 精准检索用小块
    big_text: str     # 充分生成用大块（小块所属）


def _split_sentences(text: str) -> list[str]:
    """按句界还原句子列表（保留句末标点）。无句界符时整段视作一句。"""
    sents = [p for p in _SENT_RE.findall(text) if p.strip()]
    # 末尾没有句界符的残余文本也要保留
    consumed = "".join(_SENT_RE.findall(text))
    tail = text[len(consumed):].strip()
    if tail:
        sents.append(tail)
    if not sents and text.strip():
        sents = [text.strip()]
    return sents


def _pack_big(sentences: list[str], big: int) -> list[list[str]]:
    """把句子贪心打包成大块（不切句，单块尽量 <= big）。"""
    groups: list[list[str]] = []
    cur: list[str] = []
    cur_len = 0
    for s in sentences:
        if cur and cur_len + len(s) > big:
            groups.append(cur)
            cur, cur_len = [], 0
        cur.append(s)
        cur_len += len(s)
    if cur:
        groups.append(cur)
    return groups


def _pack_small(sentences: list[str], small: int, overlap: int) -> list[list[str]]:
    """在一个大块内把句子打包成带重叠的小块。"""
    smalls: list[list[str]] = []
    n = len(sentences)
    i = 0
    while i < n:
        cur: list[str] = []
        cur_len = 0
        j = i
        while j < n:
            s = sentences[j]
            if cur and cur_len + len(s) > small:
                break
            cur.append(s)
            cur_len += len(s)
            j += 1
        smalls.append(cur)
        if j >= n:
            break
        # 回退若干句作为下一小块的重叠（累计长度 <= overlap）
        k, ov = 0, 0
        while k < len(cur) - 1:
            add = len(cur[-(k + 1)])
            if ov + add > overlap:
                break
            ov += add
            k += 1
        next_i = j - k
        i = next_i if next_i > i else i + 1  # 保证前进
    return smalls


def chunk_text(text: str, small: int = 300, big: int = 1800, overlap: int = 60) -> list[Chunk]:
    """把长文本切成 small-to-big 块列表。空白输入返回 []。"""
    if not text or not text.strip():
        return []

    sentences = _split_sentences(text)
    chunks: list[Chunk] = []
    seq = 0
    for big_group in _pack_big(sentences, big):
        big_text = "".join(big_group)
        for small_group in _pack_small(big_group, small, overlap):
            chunks.append(Chunk(seq=seq, small_text="".join(small_group), big_text=big_text))
            seq += 1
    return chunks
