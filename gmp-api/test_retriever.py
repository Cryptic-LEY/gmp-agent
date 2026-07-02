# -*- coding: utf-8 -*-
"""
01-vector-engine 子任务5：retriever 接入 faiss 索引、删除全量 cosine。

验收点（spec 01）：
  A2 retrieve 内不再有「全量加载所有向量 + 逐条 cosine」路径
  A3 检索 P95 < 300ms（不含 LLM；注入 query_vec 绕开 DashScope 查询嵌入）
  契约：retrieve 仍返回 list[DocChunk]，保留 BM25/图遍历/降级
"""
import json
import socket
import time

import pytest

import rag.retriever as retriever
import rag.vector_index as vi
from rag.retriever import retrieve, DocChunk, _get_conn

# 用真库现有向量建一次进程内索引（只读）。
# MySQL 不可用时跳过整个模块，不中断 pytest 收集其他测试文件。
pytestmark = pytest.mark.integration

# 快速 TCP 探针：避免等待 pymysql 全量连接超时
try:
    _s = socket.create_connection(("127.0.0.1", 3306), timeout=1)
    _s.close()
    del _s
except OSError as _e:
    pytest.skip(f"MySQL unavailable — integration tests skipped: {_e}",
                allow_module_level=True)

try:
    vi.rebuild()
except Exception as _db_err:
    pytest.skip(f"MySQL unavailable — integration tests skipped: {_db_err}",
                allow_module_level=True)


def _a_reg_vector():
    """Phase-2 后从 reg_chunks 取向量（small_text embedding，与索引一致）。"""
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT reg_id, embedding FROM reg_chunks WHERE embedding IS NOT NULL LIMIT 1")
        return cur.fetchone()


def test_anti_pattern_full_load_removed():
    """A2：全量加载/逐条 cosine 的函数应被删除，防反模式回归。"""
    assert not hasattr(retriever, "_load_embeddings"), "_load_embeddings 全量加载应被删除"
    assert not hasattr(retriever, "_cosine"), "逐条 _cosine 应被删除"


def test_retrieve_accepts_injected_query_vec_and_uses_index():
    """注入保序 mock reranker，只验证向量索引能召回对应 reg_id（与 reranker 质量解耦）。"""
    _mock_rerank = lambda q, passages: [1.0 - i * 0.001 for i in range(len(passages))]
    reg_id, emb = _a_reg_vector()
    chunks = retrieve("任意问题", query_vec=json.loads(emb), rerank_fn=_mock_rerank)
    assert chunks and all(isinstance(c, DocChunk) for c in chunks)
    assert any(c.id == reg_id for c in chunks), "用某条法规自身向量检索应召回该条"


def test_retrieve_preserves_docchunk_contract():
    _, emb = _a_reg_vector()
    chunks = retrieve("洁净区环境监测", query_vec=json.loads(emb))
    for c in chunks:
        assert c.id and c.doc_type in ("regulation", "kp", "experience")
        assert isinstance(c.score, float)


def test_precise_article_hard_indicator_hits():
    """A4：'第十条' 应通过 article_num 直查命中 article_num∈{十,10} 的条款。
    注入保序 mock reranker，只测 _article_lookup 机制（reranker 质量由 A6 单独评估）。"""
    _, emb = _a_reg_vector()
    _mock_rerank = lambda q, passages: [1.0 - i * 0.001 for i in range(len(passages))]
    chunks = retrieve("第十条规定了什么要求", query_vec=json.loads(emb),
                      rerank_fn=_mock_rerank)
    arts = {c.title for c in chunks if c.doc_type == "regulation"}
    assert arts & {"十", "10"}, f"未命中第十条，召回的 article_num={arts}"


def test_falls_back_to_keyword_when_index_unavailable():
    """A7：索引不可用时降级到关键词检索，不崩、仍返回 DocChunk。"""
    saved = vi.get_index()
    vi._index = None
    try:
        chunks = retrieve("洁净区", query_vec=[0.1] * 1024)
        assert all(isinstance(c, DocChunk) for c in chunks)
    finally:
        vi._index = saved  # 复原，避免影响后续用例


def test_retrieve_latency_p95_under_300ms():
    """A3：注入 query_vec + mock reranker，度量 faiss+MySQL 纯检索 P95（不含 rerank 网络）。"""
    _, emb = _a_reg_vector()
    qv = json.loads(emb)
    # rerank_fn mock：保持原顺序，绕开 DashScope 网络调用
    _mock_rerank = lambda q, passages: [1.0 - i * 0.01 for i in range(len(passages))]
    lat = []
    for _ in range(20):
        t0 = time.perf_counter()
        retrieve("洁净区监测的要求是什么", query_vec=qv, rerank_fn=_mock_rerank)
        lat.append((time.perf_counter() - t0) * 1000)
    lat.sort()
    p95 = lat[max(0, int(len(lat) * 0.95) - 1)]
    print(f"\nretrieve P95 = {p95:.1f}ms over {len(lat)} runs (min={lat[0]:.1f} max={lat[-1]:.1f})")
    assert p95 < 300, f"检索 P95={p95:.1f}ms 超过 300ms 预算"
