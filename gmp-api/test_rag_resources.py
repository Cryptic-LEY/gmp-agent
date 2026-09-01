# -*- coding: utf-8 -*-
"""RAG 共享资源生命周期测试；不访问真实 MySQL。"""

import importlib
import threading
import time

import pytest


class FakeConnection:
    def __init__(self):
        self.close_calls = 0

    def close(self):
        self.close_calls += 1


class FakePool:
    def __init__(self):
        self.close_calls = 0
        self.connection_calls = 0
        self.connections = []

    def connection(self):
        self.connection_calls += 1
        conn = FakeConnection()
        self.connections.append(conn)
        return conn

    def close(self):
        self.close_calls += 1


def _load_resources(monkeypatch, fake_pool, *, pool_size=1, timeout_sec=0.01):
    resources = importlib.import_module("rag.resources")
    resources.close_rag_resources()
    monkeypatch.setattr(resources, "MYSQL_POOL_SIZE", pool_size)
    monkeypatch.setattr(resources, "MYSQL_POOL_ACQUIRE_TIMEOUT_SEC", timeout_sec)
    monkeypatch.setattr(resources, "_create_pool", lambda: fake_pool)
    return resources


def test_connection_slot_times_out_while_only_slot_is_held(monkeypatch):
    """若删掉有界名额或无限等待，第二次获取不会在配置时间内明确失败。"""
    fake_pool = FakePool()
    resources = _load_resources(monkeypatch, fake_pool)

    try:
        with resources.get_db_connection() as first:
            started_at = time.monotonic()
            with pytest.raises(resources.DatabasePoolTimeout):
                with resources.get_db_connection():
                    pass
            elapsed = time.monotonic() - started_at

        assert 0.005 <= elapsed < 0.5
        assert fake_pool.connection_calls == 1
        assert first.close_calls == 1
    finally:
        resources.close_rag_resources()


def test_connection_slot_is_released_after_context_exit(monkeypatch):
    """若 finally 忘记归还名额，顺序执行的第二个请求也会超时。"""
    fake_pool = FakePool()
    resources = _load_resources(monkeypatch, fake_pool)

    try:
        with resources.get_db_connection() as first:
            assert first.close_calls == 0
        with resources.get_db_connection() as second:
            assert second.close_calls == 0

        assert fake_pool.connection_calls == 2
        assert [conn.close_calls for conn in fake_pool.connections] == [1, 1]
    finally:
        resources.close_rag_resources()


def test_retrieval_executor_is_shared_and_recreated_after_close(monkeypatch):
    """若退回每请求建线程池，相邻调用不会得到同一执行器。"""
    fake_pool = FakePool()
    resources = _load_resources(monkeypatch, fake_pool, pool_size=2)
    monkeypatch.setattr(resources, "RAG_RETRIEVE_WORKERS", 2)

    try:
        first = resources.get_retrieval_executor()
        second = resources.get_retrieval_executor()
        worker_name = first.submit(lambda: threading.current_thread().name).result()

        assert second is first
        assert worker_name.startswith("rag-retrieve")

        resources.close_rag_resources()
        third = resources.get_retrieval_executor()
        assert third is not first
    finally:
        resources.close_rag_resources()


def test_close_rag_resources_closes_initialized_pool_once(monkeypatch):
    """若应用退出没有关闭池，池的物理空闲连接会留到进程强退。"""
    fake_pool = FakePool()
    resources = _load_resources(monkeypatch, fake_pool)

    with resources.get_db_connection():
        pass
    resources.close_rag_resources()
    resources.close_rag_resources()

    assert fake_pool.close_calls == 1
