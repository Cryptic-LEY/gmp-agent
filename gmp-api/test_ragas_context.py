# -*- coding: utf-8 -*-
"""
P5 验收：evaluate_one() 使用 retrieve() 真实检索结果作为 contexts（mock retrieve 和 _llm，零 DB 零网络）。
"""
from pathlib import Path
from unittest.mock import patch

from rag.retriever import DocChunk
from eval.ragas_eval import evaluate_one

MOCK_CHUNKS = [
    DocChunk("R001", "regulation", "第一条", "GMP无菌生产区域应保持正压。", 0.9),
    DocChunk("R002", "regulation", "第二条", "洁净区温湿度应符合规定。", 0.7),
]

MOCK_RECORD = {
    "id": "T001",
    "question": "无菌生产区域的压差要求",
    "edu_level": "专科",
    "answer_points": ["保持正压", "压差大于零"],
}


def _mock_ask_fn(q, el):
    return {"answer": "无菌生产区域须保持正压。", "sources": ["R001"]}


def test_evaluate_one_calls_retrieve():
    """evaluate_one() 内部调用了 retrieve()，而非使用 answer_points。"""
    retrieve_calls = []

    def fake_retrieve(question, edu_level=None, query_vec=None):
        retrieve_calls.append({"question": question, "edu_level": edu_level})
        return MOCK_CHUNKS

    with patch("rag.retriever.retrieve", fake_retrieve), \
         patch("eval.ragas_eval._llm", return_value="YES"):
        evaluate_one(MOCK_RECORD, ask_fn=_mock_ask_fn)

    assert retrieve_calls, "retrieve() 未被调用"
    assert retrieve_calls[0]["question"] == MOCK_RECORD["question"]


def test_evaluate_one_contexts_from_retrieve_not_answer_points():
    """contexts == [chunk.content for chunk in retrieved]，不是 answer_points。"""
    captured = {}

    def fake_score_cp(question, contexts, answer_points):
        captured["contexts"] = contexts
        return 0.8

    with patch("rag.retriever.retrieve", return_value=MOCK_CHUNKS), \
         patch("eval.ragas_eval._llm", return_value="YES"), \
         patch("eval.ragas_eval._score_context_precision", fake_score_cp):
        evaluate_one(MOCK_RECORD, ask_fn=_mock_ask_fn)

    expected = [chunk.content for chunk in MOCK_CHUNKS]
    assert captured.get("contexts") == expected, \
        f"contexts 应为 retrieve() 结果，实际为 {captured.get('contexts')}"


def test_evaluate_one_scores_in_range():
    """三维分数均在 [0.0, 1.0] 或 None（judge 解析失败），latency_ms >= 0。"""
    def _smart_llm(prompt: str) -> str:
        # faithfulness scorer 需要 "声明 | YES/NO" 格式
        if "每行一条" in prompt:
            return "GMP无菌区应保持正压 | YES"
        # answer_relevance scorer 需要 1-10 数字
        if "评分1-10" in prompt:
            return "9"
        # context_precision scorer 需要 YES/NO
        return "YES"

    with patch("rag.retriever.retrieve", return_value=MOCK_CHUNKS), \
         patch("eval.ragas_eval._llm", side_effect=_smart_llm):
        result = evaluate_one(MOCK_RECORD, ask_fn=_mock_ask_fn)

    assert "error" not in result, f"evaluate_one 返回错误: {result.get('error')}"
    for key in ("context_precision", "faithfulness", "answer_relevance"):
        v = result[key]
        assert v is None or 0.0 <= v <= 1.0, f"{key} = {v} 超出 [0, 1] 且不为 None"
    assert result["latency_ms"] >= 0


def test_contexts_not_answer_points_in_source():
    """ragas_eval.py 中不再出现 'contexts = answer_points'。"""
    src = (Path(__file__).parent / "eval" / "ragas_eval.py").read_text(encoding="utf-8")
    assert "contexts = answer_points" not in src, \
        "ragas_eval.py 仍含 'contexts = answer_points'"
