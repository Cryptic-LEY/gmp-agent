# -*- coding: utf-8 -*-
"""FastAPI 对 RAG 共享资源的启动与退出生命周期测试。"""

import asyncio

import main


def test_app_lifespan_builds_index_then_closes_rag_resources(monkeypatch):
    """若未注册 shutdown 清理或顺序错误，资源会泄漏或在请求期被提前关闭。"""
    events = []
    monkeypatch.setattr(main, "_build_vector_index", lambda: events.append("startup"))
    monkeypatch.setattr(
        main,
        "close_rag_resources",
        lambda: events.append("shutdown"),
        raising=False,
    )

    async def exercise_lifespan():
        async with main.app.router.lifespan_context(main.app):
            events.append("inside")

    asyncio.run(exercise_lifespan())

    assert events == ["startup", "inside", "shutdown"]
