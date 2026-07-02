# -*- coding: utf-8 -*-
"""
D1 回归测试（MySQL 版）：取代已损坏的 test_p1.py。
覆盖：条款号幻觉检测 / edu_level 过滤 / BM25混合检索。
"""
import json
import socket
import pytest

import rag.vector_index as vi
from rag.retriever import retrieve, DocChunk, _get_conn
from agents.tutor import _check_hallucinated_articles


def _db_reachable(host: str = "127.0.0.1", port: int = 3306, timeout: float = 1.0) -> bool:
    """快速 TCP 探针：MySQL 不可达时避免等待 pymysql 全量连接超时。"""
    try:
        s = socket.create_connection((host, port), timeout=timeout)
        s.close()
        return True
    except OSError:
        return False


# 进程内索引（只读，免费）。DB 不可达时直接跳过，绝不在导入阶段阻塞。
_index_ok = False
if _db_reachable():
    try:
        vi.rebuild()
        _index_ok = True
    except Exception:
        _index_ok = False

_skip_db = pytest.mark.skipif(not _index_ok, reason="向量索引构建失败/MySQL不可达，跳过检索测试")


def _get_reg_vec():
    """取任意一条有 embedding 的 reg_chunk 向量，供注入 query_vec 绕开 DashScope。"""
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT reg_id, embedding FROM reg_chunks WHERE embedding IS NOT NULL LIMIT 1"
        )
        return cur.fetchone()


# ═══════════════════════════════════════════════════════════════════
# P1-5  条款编号幻觉检测（纯逻辑，无需 DB/LLM）
# ═══════════════════════════════════════════════════════════════════

def test_hallucination_fake_reg_id_detected():
    """答案含虚构 REG-ID → 应检出幻觉。"""
    real_ids = {"REG-GMP2010-A010", "REG-GMP2010-A011"}
    fake_draft = "根据 REG-GMP2010-A999 的规定，洁净区必须保持正压。"
    issues = _check_hallucinated_articles(fake_draft, real_ids)
    assert issues != "", "虚构条款编号应被检出"
    assert "REG-GMP2010-A999" in issues


def test_hallucination_real_id_no_false_positive():
    """答案只含真实 REG-ID → 不误报。"""
    real_ids = {"REG-GMP2010-A010", "REG-GMP2010-A011"}
    real_draft = "根据 REG-GMP2010-A010 的规定，质量管理部门应当负责药品放行。"
    issues = _check_hallucinated_articles(real_draft, real_ids)
    assert issues == "", f"真实条款不应误报，得到: {issues}"


def test_hallucination_plain_text_no_trigger():
    """答案不含任何 REG-ID → 不触发检测。"""
    real_ids = {"REG-GMP2010-A010"}
    plain_draft = "洁净区需要定期进行悬浮粒子和微生物监测，确保符合 GMP 要求。"
    issues = _check_hallucinated_articles(plain_draft, real_ids)
    assert issues == ""


def test_hallucination_mixed_only_fake_flagged():
    """真实 + 虚构混用 → 仅虚构部分被检出，真实部分不误报。"""
    real_ids = {"REG-GMP2010-A010"}
    mixed_draft = "REG-GMP2010-A010 规定了质量管理职责，REG-GMP2010-A999 规定了..."
    issues = _check_hallucinated_articles(mixed_draft, real_ids)
    assert "REG-GMP2010-A999" in issues
    assert "REG-GMP2010-A010" not in issues


# ═══════════════════════════════════════════════════════════════════
# P1-1  BM25 / 混合检索（需要 DB + 向量索引）
# ═══════════════════════════════════════════════════════════════════

@_skip_db
def test_mixed_retrieval_returns_docchunks():
    """retrieve 返回 list[DocChunk]，每条有合法 id 和 doc_type。"""
    _, emb = _get_reg_vec()
    mock_rerank = lambda q, p: [1.0 - i * 0.001 for i in range(len(p))]
    chunks = retrieve("洁净区分级要求", query_vec=json.loads(emb), rerank_fn=mock_rerank)
    assert chunks, "应至少返回一条结果"
    for c in chunks:
        assert c.id
        assert c.doc_type in ("regulation", "kp")


@_skip_db
def test_mixed_retrieval_precise_article_hit():
    """'第十条' 查询应通过 article_num 直查命中 article_num∈{十,10}。"""
    _, emb = _get_reg_vec()
    mock_rerank = lambda q, p: [1.0 - i * 0.001 for i in range(len(p))]
    chunks = retrieve("第十条规定了什么要求", query_vec=json.loads(emb), rerank_fn=mock_rerank)
    article_nums = {c.title for c in chunks if c.doc_type == "regulation"}
    assert article_nums & {"十", "10"}, f"未命中第十条，召回 article_num={article_nums}"


# ═══════════════════════════════════════════════════════════════════
# P1-3  edu_level 学历过滤（需要 DB + 向量索引）
# ═══════════════════════════════════════════════════════════════════

@_skip_db
def test_edu_level_zj_no_bk():
    """专科查询结果中 KP 不含本科专属（BK）条目。"""
    _, emb = _get_reg_vec()
    mock_rerank = lambda q, p: [1.0 - i * 0.001 for i in range(len(p))]
    docs = retrieve("洁净区环境监测要求", edu_level="专科",
                    query_vec=json.loads(emb), rerank_fn=mock_rerank)
    kp_docs = [d for d in docs if d.doc_type == "kp"]
    bk_in_zj = [d for d in kp_docs if "BK" in d.id]
    assert not bk_in_zj, f"专科结果不应含本科KP: {[d.id for d in bk_in_zj]}"


@_skip_db
def test_edu_level_bk_no_zj():
    """本科查询结果中 KP 不含专科专属（ZJ）条目。"""
    _, emb = _get_reg_vec()
    mock_rerank = lambda q, p: [1.0 - i * 0.001 for i in range(len(p))]
    docs = retrieve("洁净区环境监测要求", edu_level="本科",
                    query_vec=json.loads(emb), rerank_fn=mock_rerank)
    kp_docs = [d for d in docs if d.doc_type == "kp"]
    zj_in_bk = [d for d in kp_docs if "ZJ" in d.id]
    assert not zj_in_bk, f"本科结果不应含专科KP: {[d.id for d in zj_in_bk]}"


@_skip_db
def test_edu_level_none_has_regulation():
    """不指定 edu_level 时法规条款仍应被召回。"""
    _, emb = _get_reg_vec()
    mock_rerank = lambda q, p: [1.0 - i * 0.001 for i in range(len(p))]
    docs = retrieve("洁净区环境监测要求", edu_level=None,
                    query_vec=json.loads(emb), rerank_fn=mock_rerank)
    reg_docs = [d for d in docs if d.doc_type == "regulation"]
    assert reg_docs, "不指定edu_level时应召回法规条款"
