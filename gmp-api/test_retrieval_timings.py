# -*- coding: utf-8 -*-
"""RAG 检索子阶段耗时测试；不访问真实数据库、索引或外部 API。"""

from contextlib import contextmanager
from threading import Barrier, Lock
from types import SimpleNamespace
import time

import rag.retriever as retriever


def test_parallel_fetch_reports_branch_and_wall_clock_timings(monkeypatch):
    """两路未真正并发或缺失分支/墙钟计时时，本测试必须失败。"""
    start_gate = Barrier(2, timeout=1.0)

    class FakeIndex:
        def search(self, query_vec, k, edu_level):
            start_gate.wait()
            time.sleep(0.050)
            return []

    @contextmanager
    def fake_conn():
        yield object()

    def fake_article_lookup(conn, question):
        start_gate.wait()
        time.sleep(0.080)
        return []

    monkeypatch.setattr(retriever, "_get_conn", fake_conn)
    monkeypatch.setattr(retriever, "_article_lookup", fake_article_lookup)
    monkeypatch.setattr(retriever, "_fulltext_search", lambda *args, **kwargs: [])

    with retriever.capture_retrieval_timings() as timings:
        vector_hits, ft_ids, art_rows = retriever._parallel_fetch(
            "什么是GMP？", [0.1, 0.2], None, FakeIndex(), object(),
        )

    assert vector_hits == [] and ft_ids == [] and art_rows == []
    assert timings["retrieve_hnsw"] >= 40
    assert timings["retrieve_mysql"] >= 70
    assert timings["retrieve_recall_wall"] >= timings["retrieve_mysql"]


def test_retrieve_reports_all_substages_without_changing_results(monkeypatch):
    """删除任一检索子阶段计时或观测改变结果时，本测试必须失败。"""
    import rag.vector_index as vector_index

    class FakeIndex:
        size = 1

        def search(self, query_vec, k, edu_level):
            return [SimpleNamespace(
                id="REG-1",
                doc_type="regulation",
                title="第一条",
                content="GMP 测试法规内容",
                score=0.9,
            )]

        def similarity(self, query_vec, ids):
            return {}

        def get_best_record(self, record_id, query_vec):
            return None

        def get_record(self, record_id):
            return None

    @contextmanager
    def fake_conn():
        time.sleep(0.020)
        yield object()

    def fake_graph_expand(conn, reg_ids, kp_ids):
        time.sleep(0.030)
        return [], []

    def fake_rerank(question, passages):
        time.sleep(0.040)
        return [0.95 for _ in passages]

    monkeypatch.setattr(retriever, "_get_conn", fake_conn)
    monkeypatch.setattr(retriever, "_article_lookup", lambda *args, **kwargs: [])
    monkeypatch.setattr(retriever, "_fulltext_search", lambda *args, **kwargs: [])
    monkeypatch.setattr(retriever, "_graph_expand", fake_graph_expand)
    monkeypatch.setattr(vector_index, "get_index", lambda: FakeIndex())
    monkeypatch.setattr(retriever, "RAG_PARALLEL_RETRIEVE", True)
    monkeypatch.setattr(retriever, "RAG_RERANK_ENABLED", True)
    monkeypatch.setattr(retriever, "RAG_HYDE_ENABLED", False)

    with retriever.capture_retrieval_timings() as timings:
        chunks = retriever.retrieve(
            "什么是GMP？",
            query_vec=[0.1, 0.2],
            rerank_fn=fake_rerank,
        )

    assert [chunk.id for chunk in chunks] == ["REG-1"]
    assert {
        "retrieve_query_vector",
        "retrieve_db_pool_wait",
        "retrieve_executor_queue",
        "retrieve_hnsw",
        "retrieve_mysql",
        "retrieve_recall_wall",
        "retrieve_fusion",
        "retrieve_graph_expand",
        "retrieve_rerank",
        "retrieve_assemble",
    } == set(timings)
    assert timings["retrieve_graph_expand"] >= 20
    assert timings["retrieve_rerank"] >= 30


def _run_retrieve_with_connection_tracking(monkeypatch):
    """运行一条完全隔离的检索路径，并返回连接生命周期观测值。"""
    import rag.vector_index as vector_index

    class FakeIndex:
        size = 1

        def search(self, query_vec, k, edu_level):
            return [SimpleNamespace(
                id="REG-1",
                doc_type="regulation",
                title="第一条",
                content="GMP 测试法规内容",
                score=0.9,
            )]

        def similarity(self, query_vec, ids):
            return {}

        def get_best_record(self, record_id, query_vec):
            return None

        def get_record(self, record_id):
            return None

    state = {"active": 0, "peak": 0, "rerank_active": None}
    state_lock = Lock()

    @contextmanager
    def tracking_conn():
        with state_lock:
            state["active"] += 1
            state["peak"] = max(state["peak"], state["active"])
        try:
            yield object()
        finally:
            with state_lock:
                state["active"] -= 1

    def fake_rerank(question, passages):
        with state_lock:
            state["rerank_active"] = state["active"]
        return [1.0 for _ in passages]

    monkeypatch.setattr(retriever, "_get_conn", tracking_conn)
    monkeypatch.setattr(retriever, "_article_lookup", lambda *args, **kwargs: [])
    monkeypatch.setattr(retriever, "_fulltext_search", lambda *args, **kwargs: [])
    monkeypatch.setattr(retriever, "_graph_expand", lambda *args, **kwargs: ([], []))
    monkeypatch.setattr(vector_index, "get_index", lambda: FakeIndex())
    monkeypatch.setattr(retriever, "RAG_PARALLEL_RETRIEVE", True)
    monkeypatch.setattr(retriever, "RAG_RERANK_ENABLED", True)
    monkeypatch.setattr(retriever, "RAG_HYDE_ENABLED", False)

    chunks = retriever.retrieve(
        "什么是GMP？",
        query_vec=[0.1, 0.2],
        rerank_fn=fake_rerank,
    )
    assert [chunk.id for chunk in chunks] == ["REG-1"]
    return state


def test_retrieve_never_overlaps_database_connections(monkeypatch):
    """若并行分支再次借连接，单请求连接峰值会从 1 回归成 2。"""
    state = _run_retrieve_with_connection_tracking(monkeypatch)
    assert state["peak"] == 1


def test_retrieve_releases_database_connection_before_rerank(monkeypatch):
    """若连接作用域包住外部 rerank，慢网络会长期占用数据库连接。"""
    state = _run_retrieve_with_connection_tracking(monkeypatch)
    assert state["rerank_active"] == 0
