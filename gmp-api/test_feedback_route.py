# -*- coding: utf-8 -*-
"""D6 feedback 路由端到端测试：前端负反馈 → error_book 写入（不调 DashScope）。"""
import pytest
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
