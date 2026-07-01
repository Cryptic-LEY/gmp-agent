"""
D4 SelfCheckGPT：同问多次采样，算答案间语义一致性。
一致性分低 → 疑似瞎编（模型在不同采样中自相矛盾）。

consistency_score 使用字符 bigram Jaccard 相似度——中文友好且无需分词器。
生产环境采样调 DashScope；测试时注入 llm_fn 绕开网络。
"""
from __future__ import annotations

from config import SELFCHECK_SAMPLES


def _bigrams(text: str) -> set:
    return {text[i:i+2] for i in range(len(text) - 1)} if len(text) > 1 else {text}


def _text_similarity(a: str, b: str) -> float:
    """字符 bigram 集合 Jaccard（中文无需分词，英文同样有效）。"""
    ba, bb = _bigrams(a), _bigrams(b)
    if not ba or not bb:
        return 0.0
    return len(ba & bb) / len(ba | bb)


def consistency_score(answers: list[str]) -> float:
    """
    均值成对 Jaccard 相似度：
    - 相同答案 → 1.0
    - 完全不同 → 接近 0.0
    单条答案返回 1.0（无可比较对象，默认稳定）。
    """
    if len(answers) <= 1:
        return 1.0
    scores: list[float] = []
    for i in range(len(answers)):
        for j in range(i + 1, len(answers)):
            scores.append(_text_similarity(answers[i], answers[j]))
    return sum(scores) / len(scores) if scores else 1.0


def sample_answers(question: str, n: int = SELFCHECK_SAMPLES, llm_fn=None) -> list[str]:
    """
    采样 n 条回答。
    llm_fn: (question: str) -> str，注入后绕开 DashScope（测试/离线用）。
    生产时调 DashScope（qwen-turbo，temperature=0.7 增加多样性）。
    """
    if llm_fn is not None:
        return [llm_fn(question) for _ in range(n)]

    # 生产路径（调 DashScope）
    from agents.tutor import _llm_chat
    from agents.router import route_model
    msgs = [{"role": "user", "content": question}]
    results = []
    for _ in range(n):
        try:
            ans = _llm_chat(msgs, temperature=0.7, model=route_model("generate"))
        except Exception:
            ans = ""
        results.append(ans)
    return results


def check_consistency(
    question: str,
    n: int = SELFCHECK_SAMPLES,
    threshold: float = 0.7,
    llm_fn=None,
) -> dict:
    """
    SelfCheckGPT 入口：
      - 采样 n 次回答
      - 计算成对一致性分数
      - score >= threshold → is_stable=True（答案稳定）
      - score <  threshold → is_stable=False（疑似幻觉/瞎编）
    Returns:
        {"score": float, "is_stable": bool, "samples": list[str]}
    """
    samples = sample_answers(question, n=n, llm_fn=llm_fn)
    score = consistency_score(samples)
    return {
        "score": score,
        "is_stable": score >= threshold,
        "samples": samples,
    }
