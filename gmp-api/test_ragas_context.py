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
        return 0.8, {"per_context": [], "n_judged": 0, "relevant": 0}

    with patch("rag.retriever.retrieve", return_value=MOCK_CHUNKS), \
         patch("eval.ragas_eval._llm", return_value="YES"), \
         patch("eval.ragas_eval._score_context_precision", fake_score_cp):
        evaluate_one(MOCK_RECORD, ask_fn=_mock_ask_fn)

    expected = [chunk.content for chunk in MOCK_CHUNKS]
    assert captured.get("contexts") == expected, \
        f"contexts 应为 retrieve() 结果，实际为 {captured.get('contexts')}"


def test_evaluate_one_saves_full_observability():
    """点1：结果保存完整答案、完整 contexts、金标要点、judge 逐条判断（可复盘）。"""
    def _smart_llm(prompt: str) -> str:
        if "每行一条" in prompt:
            return "无菌区应保持正压 | YES\n压差大于零 | YES"
        if "评分1-10" in prompt:
            return "9"
        return "YES"

    with patch("rag.retriever.retrieve", return_value=MOCK_CHUNKS), \
         patch("eval.ragas_eval._llm", side_effect=_smart_llm):
        r = evaluate_one(MOCK_RECORD, ask_fn=_mock_ask_fn)

    # 完整答案（不再截断到 200 字）
    assert r["answer"] == "无菌生产区域须保持正压。"
    # 完整 contexts == retrieve 结果（不截断）
    assert r["contexts"] == [c.content for c in MOCK_CHUNKS]
    # 金标要点留存
    assert r["answer_points"] == MOCK_RECORD["answer_points"]
    # judge 逐条原始判断留存
    jd = r["judge_detail"]
    assert set(jd) >= {"context_precision", "faithfulness", "answer_relevance"}
    assert jd["faithfulness"]["claims"], "FF 应存逐条声明判断"
    assert jd["context_precision"]["per_context"], "CP 应存每个 context 的判断"
    assert jd["answer_relevance"]["raw"] is not None, "AR 应存 judge 原始输出"


def test_run_meta_has_hash_and_config():
    """点1：run_meta 含 golden 哈希、配置快照、命令、eval_kind 正名。"""
    import tempfile, os, hashlib
    from eval.ragas_eval import _build_run_meta
    with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False, encoding="utf-8") as f:
        f.write('{"id":"X","question":"q","answer_points":["a"]}\n')
        p = f.name
    try:
        meta = _build_run_meta(p, n_requested=1, golden_n_total=1, index_note="test-index")
        assert meta["golden_sha256"] == hashlib.sha256(open(p, "rb").read()).hexdigest()
        assert meta["config_snapshot"]["CTX_COMPRESS_RATIO"] is not None
        assert "SEMANTIC_CACHE_ENABLED" in meta["config_snapshot"]
        assert meta["eval_kind"].startswith("RAGAS-like")
        assert "command" in meta and meta["index_state"] == "test-index"
    finally:
        os.unlink(p)


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


def test_faithfulness_uses_all_contexts_not_top5():
    """点2：FF 使用全部 contexts，不再只取前 5（与模型真正看到的证据对齐）。"""
    from eval.ragas_eval import _score_faithfulness
    ctxs = [f"参考{i}" for i in range(7)]
    with patch("eval.ragas_eval._llm", return_value="声明A | YES\n声明B | NO"):
        score, detail = _score_faithfulness("某答案", ctxs)
    assert detail["n_contexts_used"] == 7, f"FF 应使用全部 7 条 context，实际 {detail['n_contexts_used']}"
    assert score == 0.5  # 1 YES / 2 声明


def test_evaluate_one_ff_scores_against_gen_contexts():
    """点2：FF 打分对齐 gen_contexts（压缩+重排后模型实际所见），CP/复盘仍用检索原文。"""
    captured = {}

    def fake_ff(answer, contexts):
        captured["ff_contexts"] = contexts
        return 1.0, {"n_contexts_used": len(contexts), "claims": [], "n_claims": 0,
                     "supported": 0, "raw": None, "error": None}

    def ask_fn(q, el):
        return {"answer": "A", "sources": ["R1"],
                "contexts": ["检索原文-未压缩"],
                "gen_contexts": ["压缩重排后-模型实际所见"]}

    with patch("eval.ragas_eval._score_faithfulness", fake_ff), \
         patch("eval.ragas_eval._llm", return_value="YES"):
        r = evaluate_one(MOCK_RECORD, ask_fn=ask_fn)

    assert captured["ff_contexts"] == ["压缩重排后-模型实际所见"], "FF 未对齐 gen_contexts"
    assert r["ff_context_source"] == "gen_contexts"
    assert r["contexts"] == ["检索原文-未压缩"]        # CP/复盘用检索原文
    assert r["gen_contexts"] == ["压缩重排后-模型实际所见"]


def test_evaluate_one_ff_falls_back_when_no_gen_contexts():
    """点2：ask_fn 未提供 gen_contexts 时，FF 回退用 contexts（向后兼容）。"""
    captured = {}

    def fake_ff(answer, contexts):
        captured["ff_contexts"] = contexts
        return 1.0, {"n_contexts_used": len(contexts)}

    def ask_fn(q, el):
        return {"answer": "A", "sources": ["R1"], "contexts": ["只有检索原文"]}

    with patch("eval.ragas_eval._score_faithfulness", fake_ff), \
         patch("eval.ragas_eval._llm", return_value="YES"):
        r = evaluate_one(MOCK_RECORD, ask_fn=ask_fn)

    assert captured["ff_contexts"] == ["只有检索原文"]
    assert r["ff_context_source"] == "contexts"


def test_disable_semantic_cache_context():
    """点3：评测期间关闭语义缓存做隔离，退出后恢复原值。"""
    import agents.tutor as t
    from eval.ragas_eval import _disable_semantic_cache
    orig = t.SEMANTIC_CACHE_ENABLED
    try:
        t.SEMANTIC_CACHE_ENABLED = True
        with _disable_semantic_cache(True):
            assert t.SEMANTIC_CACHE_ENABLED is False, "评测期内缓存应被关闭"
        assert t.SEMANTIC_CACHE_ENABLED is True, "退出后应恢复"
        with _disable_semantic_cache(False):
            assert t.SEMANTIC_CACHE_ENABLED is True, "disable=False 时不动缓存"
    finally:
        t.SEMANTIC_CACHE_ENABLED = orig


def test_disable_semantic_cache_restores_on_exception():
    """点3：即使评测中途异常，也要恢复缓存开关（不污染后续进程内状态）。"""
    import agents.tutor as t
    from eval.ragas_eval import _disable_semantic_cache
    orig = t.SEMANTIC_CACHE_ENABLED
    try:
        t.SEMANTIC_CACHE_ENABLED = True
        try:
            with _disable_semantic_cache(True):
                raise RuntimeError("boom")
        except RuntimeError:
            pass
        assert t.SEMANTIC_CACHE_ENABLED is True, "异常后仍应恢复"
    finally:
        t.SEMANTIC_CACHE_ENABLED = orig


def test_run_meta_records_cache_isolation():
    """点3：run_meta 记录本次评测是否关闭了缓存（可观测）。"""
    import tempfile, os
    from eval.ragas_eval import _build_run_meta
    with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False, encoding="utf-8") as f:
        f.write('{"id":"X"}\n')
        p = f.name
    try:
        meta = _build_run_meta(p, 1, 1, "idx", cache_disabled=True)
        assert meta["cache_isolation"]["disabled_for_eval"] is True
    finally:
        os.unlink(p)


def test_contexts_not_answer_points_in_source():
    """ragas_eval.py 中不再出现 'contexts = answer_points'。"""
    src = (Path(__file__).parent / "eval" / "ragas_eval.py").read_text(encoding="utf-8")
    assert "contexts = answer_points" not in src, \
        "ragas_eval.py 仍含 'contexts = answer_points'"
