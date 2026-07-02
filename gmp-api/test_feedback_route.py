# -*- coding: utf-8 -*-
"""D6 feedback 路由端到端测试：前端负反馈 → error_book 写入（不调 DashScope）。"""
import socket
import pytest

pytestmark = pytest.mark.integration

# MySQL 不可用时跳过整个模块（startup 事件会调 vector_index.rebuild()）
try:
    _s = socket.create_connection(("127.0.0.1", 3306), timeout=1)
    _s.close()
    del _s
except OSError as _e:
    pytest.skip(f"MySQL unavailable — integration tests skipped: {_e}",
                allow_module_level=True)

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

_PREFIX = "_pytest_fb_"


@pytest.fixture(autouse=True)
def cleanup():
    yield
    try:
        from eval.error_book import _get_conn
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM error_book WHERE question LIKE %s",
                            (_PREFIX + "%",))
    except Exception:
        pass


def test_feedback_records_to_error_book():
    """POST /chat/feedback → 写入 error_book，可被 get_few_shot_negatives 查到。"""
    q = f"{_PREFIX}洁净区温度"
    bad = "温度应维持60°C以上"
    resp = client.post("/chat/feedback", json={
        "question": q, "bad_answer": bad,
        "reason": "与资料矛盾", "fix_hint": "应为20-25°C",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "recorded"
    assert isinstance(data["error_id"], int) and data["error_id"] > 0

    from eval.error_book import get_few_shot_negatives
    negs = get_few_shot_negatives(q, n=5)
    assert any(n["bad_answer"] == bad for n in negs), \
        "feedback 写入后应在 few_shot_negatives 中可查"


def test_feedback_empty_question_rejected():
    resp = client.post("/chat/feedback", json={"question": "", "bad_answer": "something"})
    assert resp.status_code == 400


def test_feedback_empty_bad_answer_rejected():
    resp = client.post("/chat/feedback", json={
        "question": f"{_PREFIX}valid", "bad_answer": "   "
    })
    assert resp.status_code == 400


def test_feedback_default_source_is_user_feedback():
    q = f"{_PREFIX}source测试"
    client.post("/chat/feedback", json={
        "question": q, "bad_answer": "错误答案", "reason": "测试"
    })
    from eval.error_book import get_recent_errors
    records = get_recent_errors(question=q, n=5)
    assert records and records[0]["source"] == "user_feedback"


# ── C6：正反馈服务端 Critic 复核（不信客户端 critic_triggered）─────────────────

def test_positive_feedback_rejects_hallucinated_citation(monkeypatch):
    """答案引用了检索里不存在的条款号 → 服务端 Critic 拒绝回流（客户端无法绕过）。"""
    import rag.retriever as rr
    from rag.retriever import DocChunk
    monkeypatch.setattr(rr, "retrieve",
        lambda q, edu_level=None: [DocChunk("REG-GMP2010-A010", "regulation", "十", "内容", 0.9)])
    resp = client.post("/chat/feedback/positive", json={
        "question": "GMP第十条规定了什么", "answer": "依据 REG-FAKE-999 的规定……"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected", resp.json()


def test_positive_feedback_rejects_semantic_contradiction(monkeypatch):
    """答案不伪造 REG-ID 但内容与上下文矛盾 → CoVe 忠实度关拒绝回流。"""
    import rag.retriever as rr
    from rag.retriever import DocChunk
    import agents.tutor as tutor
    monkeypatch.setattr(rr, "retrieve",
        lambda q, edu_level=None: [DocChunk("REG-GMP2010-A010", "regulation", "十", "洁净区应保持正压", 0.9)])
    # CoVe 返回非空 = 发现矛盾
    monkeypatch.setattr(tutor, "_cove_verify", lambda draft, ctx, **k: "答案称负压，与资料正压矛盾")
    resp = client.post("/chat/feedback/positive", json={
        "question": "洁净区压差要求", "answer": "洁净区应保持负压。"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected", resp.json()


def test_positive_feedback_reflows_clean_answer(monkeypatch):
    """答案只引用检索命中的条款且 CoVe 通过 → 回流。"""
    import rag.retriever as rr
    from rag.retriever import DocChunk
    import memory.experience as exp
    import agents.tutor as tutor
    monkeypatch.setattr(rr, "retrieve",
        lambda q, edu_level=None: [DocChunk("REG-GMP2010-A010", "regulation", "十", "内容", 0.9)])
    monkeypatch.setattr(tutor, "_cove_verify", lambda draft, ctx, **k: "")  # 通过
    monkeypatch.setattr(exp, "add_experience", lambda *a, **k: (True, True))
    resp = client.post("/chat/feedback/positive", json={
        "question": "GMP第十条规定了什么", "answer": "依据 REG-GMP2010-A010 规定……"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "reflowed", resp.json()


def test_positive_feedback_reports_volatile_when_persist_fails(monkeypatch):
    """持久化失败时不谎称 durable：返回 reflowed_volatile 并带 warning。"""
    import rag.retriever as rr
    from rag.retriever import DocChunk
    import memory.experience as exp
    import agents.tutor as tutor
    monkeypatch.setattr(rr, "retrieve",
        lambda q, edu_level=None: [DocChunk("REG-GMP2010-A010", "regulation", "十", "内容", 0.9)])
    monkeypatch.setattr(tutor, "_cove_verify", lambda draft, ctx, **k: "")  # 通过
    # 索引成功但持久化失败
    monkeypatch.setattr(exp, "add_experience", lambda *a, **k: (True, False))
    resp = client.post("/chat/feedback/positive", json={
        "question": "GMP第十条规定了什么", "answer": "依据 REG-GMP2010-A010 规定……"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "reflowed_volatile", body
    assert "warning" in body
