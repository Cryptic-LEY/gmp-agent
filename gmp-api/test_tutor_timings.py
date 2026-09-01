# -*- coding: utf-8 -*-
"""Tutor Agent 阶段耗时观测测试；全部隔离外部模型和数据库。"""

from contextlib import contextmanager

from langchain_core.messages import HumanMessage

import agents.tutor as tutor


def test_retrieve_stage_records_elapsed_time_and_preserves_existing_timings(monkeypatch):
    """删除 node_retrieve 的计时代码时，本测试必须失败。"""
    clock = iter([10.0, 10.125])
    monkeypatch.setattr(tutor.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(tutor, "retrieve", lambda *args, **kwargs: [])

    @contextmanager
    def fake_capture():
        yield {
            "retrieve_query_vector": 0,
            "retrieve_db_connect": 2,
            "retrieve_hnsw": 5,
            "retrieve_mysql": 8,
            "retrieve_recall_wall": 9,
            "retrieve_fusion": 1,
            "retrieve_graph_expand": 3,
            "retrieve_rerank": 80,
            "retrieve_assemble": 1,
        }

    monkeypatch.setattr(tutor, "capture_retrieval_timings", fake_capture)

    out = tutor.node_retrieve({
        "messages": [HumanMessage(content="什么是GMP？")],
        "edu_level": None,
        "query_vec": None,
        "timings_ms": {"generate": 7},
    })

    assert out["timings_ms"] == {
        "generate": 7,
        "retrieve": 125,
        "retrieve_query_vector": 0,
        "retrieve_db_connect": 2,
        "retrieve_hnsw": 5,
        "retrieve_mysql": 8,
        "retrieve_recall_wall": 9,
        "retrieve_fusion": 1,
        "retrieve_graph_expand": 3,
        "retrieve_rerank": 80,
        "retrieve_assemble": 1,
    }


def test_ask_tutor_returns_complete_request_timings(monkeypatch):
    """删除入口阶段计时或把旧耗时写进新请求时，本测试必须失败。"""
    from cache import semantic_cache
    from rag import retriever

    class FakeClock:
        now = 0.0

        def monotonic(self):
            return self.now

        def advance(self, seconds: float):
            self.now += seconds

    clock = FakeClock()

    class FakeCache:
        def get(self, *args, **kwargs):
            clock.advance(0.250)
            return None

        def put(self, *args, **kwargs):
            return None

    class FakeGraph:
        def invoke(self, state):
            clock.advance(0.500)
            return {
                **state,
                "retrieved_docs": [],
                "draft_answer": "测试答案",
                "final_answer": "测试答案",
                "critic_ever": False,
                "gen_contexts": [],
                "timings_ms": {
                    **state["timings_ms"],
                    "retrieve": 100,
                    "generate": 200,
                    "critique": 300,
                    "revise": 0,
                },
            }

    def fake_embed_query(question):
        clock.advance(0.125)
        return [0.1, 0.2]

    monkeypatch.setattr(tutor.time, "monotonic", clock.monotonic)
    monkeypatch.setattr(tutor, "SEMANTIC_CACHE_ENABLED", True)
    monkeypatch.setattr(tutor, "tutor_graph", FakeGraph())
    monkeypatch.setattr(tutor, "log_query", lambda **kwargs: None)
    monkeypatch.setattr(retriever, "embed_query", fake_embed_query)
    monkeypatch.setattr(semantic_cache, "get_cache", lambda: FakeCache())

    result = tutor.ask_tutor("什么是GMP？")

    assert result["timings_ms"] == {
        "memory": 0,
        "embedding": 125,
        "cache_lookup": 250,
        "retrieve": 100,
        "generate": 200,
        "critique": 300,
        "revise": 0,
        "total": 875,
    }


def test_ask_tutor_returns_stage_counts(monkeypatch):
    """节点漏计、重复计数或 ask_tutor 不返回计数时，本测试必须失败。"""
    monkeypatch.setattr(tutor, "retrieve", lambda *args, **kwargs: [])
    monkeypatch.setattr(tutor, "_llm_chat", lambda *args, **kwargs: "测试答案")
    monkeypatch.setattr(tutor, "log_query", lambda **kwargs: None)
    monkeypatch.setattr(tutor, "SEMANTIC_CACHE_ENABLED", False)

    result = tutor.ask_tutor("什么是GMP？")

    assert result["stage_counts"] == {
        "retrieve_calls": 1,
        "generate_calls": 1,
        "critique_calls": 1,
        "revise_calls": 0,
    }


def test_critique_and_revise_counts_accumulate_across_loop(monkeypatch):
    """循环节点覆盖旧计数或 revise 漏计时，本测试必须失败。"""
    monkeypatch.setattr(tutor, "_critique_answer", lambda *args, **kwargs: "仍有问题")
    monkeypatch.setattr(tutor, "_llm_chat", lambda *args, **kwargs: "修订答案")
    initial_counts = {
        "retrieve_calls": 1,
        "generate_calls": 1,
        "critique_calls": 0,
        "revise_calls": 0,
    }

    first_critique = tutor.node_critique({
        "retrieved_docs": [],
        "draft_answer": "原答案",
        "timings_ms": {},
        "stage_counts": initial_counts,
    })
    revised = tutor.node_revise({
        "critic_issues": first_critique["critic_issues"],
        "draft_answer": "原答案",
        "step": 0,
        "timings_ms": first_critique["timings_ms"],
        "stage_counts": first_critique["stage_counts"],
    })
    second_critique = tutor.node_critique({
        "retrieved_docs": [],
        "draft_answer": revised["draft_answer"],
        "timings_ms": revised["timings_ms"],
        "stage_counts": revised["stage_counts"],
    })

    assert second_critique["stage_counts"] == {
        "retrieve_calls": 1,
        "generate_calls": 1,
        "critique_calls": 2,
        "revise_calls": 1,
    }


def test_generate_stage_accumulates_elapsed_time(monkeypatch):
    """删除 node_generate 的计时或覆盖旧值时，本测试必须失败。"""
    from eval import error_book

    clock = iter([1.0, 1.125])
    monkeypatch.setattr(tutor.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(tutor, "_llm_chat", lambda *args, **kwargs: "测试答案")
    monkeypatch.setattr(error_book, "get_few_shot_negatives", lambda *args, **kwargs: [])

    out = tutor.node_generate({
        "messages": [HumanMessage(content="什么是GMP？")],
        "retrieved_docs": [],
        "edu_level": None,
        "profile_hint": "",
        "summary": "",
        "current_state": {},
        "timings_ms": {"generate": 5},
    })

    assert out["timings_ms"]["generate"] == 130


def test_critique_stage_accumulates_elapsed_time(monkeypatch):
    """第二轮 critique 覆盖第一轮耗时时，本测试必须失败。"""
    clock = iter([2.0, 2.125])
    monkeypatch.setattr(tutor.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(tutor, "_critique_answer", lambda *args, **kwargs: "")

    out = tutor.node_critique({
        "retrieved_docs": [],
        "draft_answer": "测试答案",
        "timings_ms": {"critique": 11},
    })

    assert out["timings_ms"]["critique"] == 136


def test_revise_stage_accumulates_elapsed_time(monkeypatch):
    """多轮 revise 覆盖先前耗时时，本测试必须失败。"""
    clock = iter([3.0, 3.250])
    monkeypatch.setattr(tutor.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(tutor, "_llm_chat", lambda *args, **kwargs: "修订答案")

    out = tutor.node_revise({
        "critic_issues": "存在问题",
        "draft_answer": "原答案",
        "step": 1,
        "timings_ms": {"revise": 13},
    })

    assert out["timings_ms"]["revise"] == 263


def test_chat_tutor_exposes_timings_only_when_requested(monkeypatch):
    """API 默认泄露内部耗时或显式请求拿不到耗时时，本测试必须失败。"""
    from fastapi.testclient import TestClient
    import main

    fake_result = {
        "answer": "测试答案",
        "sources": ["REG-GMP2010-1"],
        "critic_triggered": False,
        "timings_ms": {
            "memory": 0,
            "embedding": 10,
            "cache_lookup": 1,
            "retrieve": 20,
            "generate": 30,
            "critique": 40,
            "revise": 0,
            "total": 101,
        },
        "stage_counts": {
            "retrieve_calls": 1,
            "generate_calls": 1,
            "critique_calls": 2,
            "revise_calls": 1,
        },
    }
    monkeypatch.setattr(main, "ask_tutor", lambda *args, **kwargs: fake_result)
    client = TestClient(main.app)

    included = client.post(
        "/chat/tutor",
        json={"question": "什么是GMP？", "include_timings": True},
    )
    hidden = client.post("/chat/tutor", json={"question": "什么是GMP？"})

    assert included.status_code == 200
    assert included.json()["timings_ms"] == fake_result["timings_ms"]
    assert included.json()["stage_counts"] == fake_result["stage_counts"]
    assert hidden.status_code == 200
    assert "timings_ms" not in hidden.json()
    assert "stage_counts" not in hidden.json()
