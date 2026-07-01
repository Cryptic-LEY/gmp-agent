# -*- coding: utf-8 -*-
"""
03-memory 子任务：四层记忆单测

C1  原地更新：budget=5万 → 8万，get_profile 只返回 8万（旧值不残留）
C3  摘要触发：第 7 轮起 should_summarize=True，build_window_and_summary 返回非空 summary
C4  语义级短期记忆：闲聊轮（谢谢/你好）被 filter_semantic_history 剔除
C5  个性化：同一问题，不同档案 get_profile_hint 结果不同，且注入 generate messages
C6  经验回流：add_experience 后 search 能找到 doc_type='experience' 条目
C8  向后兼容：ask_tutor 无 user_id 与现状一致
"""
from __future__ import annotations

import numpy as np
import pytest
from unittest.mock import patch, MagicMock


# ─── C1: 档案卡原地更新 ─────────────────────────────────────────────────────────

_C1_USER = "_spec03_c1_test_"


def _cleanup_c1():
    try:
        from memory.profile import _get_conn
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM user_profile WHERE user_id = %s", (_C1_USER,))
    except Exception:
        pass


@pytest.mark.integration
def test_c1_upsert_overwrites_old_value():
    """C1: 先写 prefs.budget=5万，再写 8万，get_profile 只返回 8万（旧值不残留）。"""
    _cleanup_c1()
    try:
        from memory.profile import get_profile, upsert_profile
        upsert_profile(_C1_USER, {"prefs": {"budget": "5万"}})
        upsert_profile(_C1_USER, {"prefs": {"budget": "8万"}})
        profile = get_profile(_C1_USER)
        assert profile.get("prefs", {}).get("budget") == "8万", \
            f"期望 8万，实际: {profile}"
        assert "5万" not in str(profile), f"旧值 5万 不应残留，实际: {profile}"
    finally:
        _cleanup_c1()


@pytest.mark.integration
def test_c1_upsert_creates_if_not_exists():
    """C1 补充：用户不存在时 upsert 新建。"""
    _cleanup_c1()
    try:
        from memory.profile import get_profile, upsert_profile
        upsert_profile(_C1_USER, {"edu_level": "本科", "major": "药物制剂"})
        profile = get_profile(_C1_USER)
        assert profile.get("edu_level") == "本科"
        assert profile.get("major") == "药物制剂"
    finally:
        _cleanup_c1()


@pytest.mark.integration
def test_c1_get_profile_empty_for_unknown_user():
    """C1 补充：未知 user_id 返回空 dict。"""
    from memory.profile import get_profile
    profile = get_profile("_nonexistent_user_spec03_xyz_")
    assert profile == {}


# ─── C3: 摘要触发 ───────────────────────────────────────────────────────────────

def _make_history(turns: int) -> list[dict]:
    """生成 turns 轮真实 GMP 问答历史（非闲聊）。"""
    h = []
    for i in range(turns):
        h.append({"role": "user",      "content": f"GMP第{i+1}条洁净区要求是什么？"})
        h.append({"role": "assistant", "content": f"第{i+1}条规定洁净室应按A/B/C/D分级。"})
    return h


def test_c3_should_summarize_false_before_trigger():
    """C3: 不足触发轮数时 should_summarize 返回 False。"""
    from memory.summary import should_summarize
    from config import SUMMARY_TRIGGER_TURNS
    short = _make_history(SUMMARY_TRIGGER_TURNS - 1)
    assert not should_summarize(short), \
        f"不足 {SUMMARY_TRIGGER_TURNS} 轮不应触发摘要"


def test_c3_should_summarize_true_at_trigger():
    """C3: 到达触发轮数后 should_summarize 返回 True。"""
    from memory.summary import should_summarize
    from config import SUMMARY_TRIGGER_TURNS
    history = _make_history(SUMMARY_TRIGGER_TURNS)
    assert should_summarize(history), \
        f"满 {SUMMARY_TRIGGER_TURNS} 轮应触发摘要"


def test_c3_build_window_returns_summary():
    """C3: build_window_and_summary 触发时 summary 非空。"""
    from memory.summary import build_window_and_summary
    from config import SUMMARY_TRIGGER_TURNS, HISTORY_TURNS
    history = _make_history(SUMMARY_TRIGGER_TURNS + 2)
    mock_llm = lambda text: "近期话题：洁净区分级讨论"
    window, summary = build_window_and_summary(history, mock_llm=mock_llm)
    assert summary, "触发后应有摘要文本"


def test_c3_token_injection_capped():
    """C3: summary 触发后 window 不随轮数线性膨胀（封顶在 HISTORY_TURNS*2）。"""
    from memory.summary import build_window_and_summary
    from config import HISTORY_TURNS
    long_history = _make_history(20)
    mock_llm = lambda text: "摘要"
    window, summary = build_window_and_summary(long_history, mock_llm=mock_llm)
    assert len(window) <= HISTORY_TURNS * 2 + 2, \
        f"window 应封顶，实际 {len(window)} 条"


# ─── C4: 语义级短期记忆（闲聊过滤） ──────────────────────────────────────────────

def test_c4_chitchat_pairs_removed():
    """C4: 你好/谢谢 等纯闲聊轮次被剔除。"""
    from memory.summary import filter_semantic_history
    history = [
        {"role": "user",      "content": "你好"},
        {"role": "assistant", "content": "你好，有什么可以帮你？"},
        {"role": "user",      "content": "GMP洁净区要求是什么？"},
        {"role": "assistant", "content": "A级区要求单向流..."},
        {"role": "user",      "content": "谢谢"},
        {"role": "assistant", "content": "不客气"},
    ]
    filtered = filter_semantic_history(history)
    contents = [m["content"] for m in filtered]
    assert "你好" not in contents,    "你好 应被过滤"
    assert "谢谢" not in contents,    "谢谢 应被过滤"
    assert "GMP洁净区要求是什么？" in contents, "实质性问题应保留"
    assert "A级区要求单向流..." in contents,    "实质性答案应保留"


def test_c4_substantive_history_intact():
    """C4: 无闲聊的历史应原样保留。"""
    from memory.summary import filter_semantic_history
    history = [
        {"role": "user",      "content": "无菌操作的原则是什么？"},
        {"role": "assistant", "content": "无菌操作需在A级区进行..."},
    ]
    filtered = filter_semantic_history(history)
    assert len(filtered) == 2


@pytest.mark.parametrize("text", [
    "你好", "您好", "谢谢", "感谢", "谢谢你", "不客气",
    "好的", "好的好的", "嗯", "哦", "明白", "了解", "知道了",
    "再见", "ok", "OK", "是的", "对",
])
def test_c4_is_small_talk(text):
    """C4 参数化：各类闲聊词被识别为 small_talk。"""
    from memory.summary import is_small_talk
    assert is_small_talk(text), f"'{text}' 应识别为闲聊"


@pytest.mark.parametrize("text", [
    "GMP洁净区如何分级？",
    "无菌灌装的要求有哪些？",
    "A级区温湿度标准是什么？",
    "批记录应包含哪些内容？",
])
def test_c4_substantive_not_small_talk(text):
    """C4 参数化：实质性问题不被识别为 small_talk。"""
    from memory.summary import is_small_talk
    assert not is_small_talk(text), f"'{text}' 不应识别为闲聊"


# ─── C5: 个性化生效 ─────────────────────────────────────────────────────────────

def test_c5_profile_hint_differs_by_profile():
    """C5: 不同档案的 get_profile_hint 输出不同。"""
    from memory.profile import get_profile_hint
    profile_ug = {"edu_level": "本科", "major": "药物制剂", "weak_kp": ["洁净区分级"]}
    profile_jr = {"edu_level": "专科", "major": "中药学",  "weak_kp": ["GMP文件管理"]}
    hint_ug = get_profile_hint(profile_ug)
    hint_jr = get_profile_hint(profile_jr)
    assert hint_ug != hint_jr
    assert "本科" in hint_ug
    assert "专科" in hint_jr


def test_c5_empty_profile_returns_empty_hint():
    """C5 补充: 空档案返回空字符串。"""
    from memory.profile import get_profile_hint
    assert get_profile_hint({}) == ""


def test_c5_profile_hint_injected_into_generate_messages():
    """C5: profile_hint 注入 _build_generate_messages 的系统提示中。"""
    from agents.tutor import _build_generate_messages
    hint = "学生：本科·药物制剂，薄弱：洁净区分级"
    msgs_with = _build_generate_messages("ctx", "问题", [], "本科",  profile_hint=hint)
    msgs_without = _build_generate_messages("ctx", "问题", [], "本科", profile_hint="")
    sys_with    = msgs_with[0]["content"]
    sys_without = msgs_without[0]["content"]
    assert hint in sys_with,    "profile_hint 应出现在 system prompt 中"
    assert hint not in sys_without


def test_c5_different_profiles_produce_different_system_prompts():
    """C5: 两个不同档案注入后 system prompt 不同。"""
    from agents.tutor import _build_generate_messages
    from memory.profile import get_profile_hint
    hint_ug = get_profile_hint({"edu_level": "本科", "major": "药物制剂"})
    hint_jr = get_profile_hint({"edu_level": "专科", "major": "中药学"})
    msgs_ug = _build_generate_messages("ctx", "洁净区如何分级？", [], "本科", profile_hint=hint_ug)
    msgs_jr = _build_generate_messages("ctx", "洁净区如何分级？", [], "专科", profile_hint=hint_jr)
    assert msgs_ug[0]["content"] != msgs_jr[0]["content"]


# ─── C6: 经验回流 ───────────────────────────────────────────────────────────────

def test_c6_experience_recalled_after_add():
    """C6: add_experience 后同向量 search 能找到 doc_type='experience' 条目。"""
    from memory.experience import add_experience
    from rag.vector_index import VectorIndex
    import rag.vector_index as vi

    idx = VectorIndex()
    rng = np.random.RandomState(42)
    exp_vec = rng.randn(1024).astype(np.float32)
    exp_vec /= np.linalg.norm(exp_vec)

    mock_embed = lambda text: exp_vec.tolist()

    old_idx = vi._index
    vi._index = idx
    try:
        ok = add_experience(
            "exp001", "洁净区如何分级？", "A级是最高级洁净区，适用于高风险操作。",
            ["REG-GMP2010-001"], embed_fn=mock_embed,
        )
        assert ok, "add_experience 应返回 True"
        hits = idx.search(exp_vec.tolist(), k=5)
        exp_hits = [h for h in hits if h.doc_type == "experience"]
        assert exp_hits, "应能检索到 experience 条目"
    finally:
        vi._index = old_idx


def test_c6_experience_doc_type_correct():
    """C6 补充: add_experience 加入的条目 doc_type 为 'experience'。"""
    from memory.experience import add_experience
    from rag.vector_index import VectorIndex
    import rag.vector_index as vi

    idx = VectorIndex()
    rng = np.random.RandomState(7)
    vec = rng.randn(1024).astype(np.float32)
    vec /= np.linalg.norm(vec)

    old_idx = vi._index
    vi._index = idx
    try:
        add_experience("exp002", "批记录应保存多久？", "批记录保存期限...", [], embed_fn=lambda t: vec.tolist())
        hits = idx.search(vec.tolist(), k=3)
        assert hits[0].doc_type == "experience"
    finally:
        vi._index = old_idx


def test_c6_experience_no_index_returns_false():
    """C6 补充: 索引为 None 时 add_experience 返回 False（降级）。"""
    from memory.experience import add_experience
    import rag.vector_index as vi
    old_idx = vi._index
    vi._index = None
    try:
        result = add_experience("exp999", "q", "a", [])
        assert result is False
    finally:
        vi._index = old_idx


# ─── C7: 命中率监控（基础写入+查询） ─────────────────────────────────────────────

_C7_USER = "_spec03_c7_test_"


def _cleanup_c7():
    try:
        from memory.metrics import _get_conn
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM memory_usage WHERE user_id = %s", (_C7_USER,))
    except Exception:
        pass


@pytest.mark.integration
def test_c7_log_memory_usage_writes_and_returns_rate():
    """C7: log_memory_usage 写入 memory_usage 表，get_hit_rate 可统计命中率。"""
    _cleanup_c7()
    try:
        from memory.metrics import log_memory_usage, get_hit_rate
        # 命中：答案包含注入实体
        log_memory_usage(_C7_USER, ["洁净区", "A级区"], "洁净区中A级区是最高级别", "_c7_sess_")
        # 未命中：答案不包含注入实体
        log_memory_usage(_C7_USER, ["文件管理"], "今天天气很好不含注入词", "_c7_sess_")
        rate = get_hit_rate(_C7_USER)
        assert 0.0 <= rate <= 1.0
        assert rate > 0, f"至少一条应被命中，实际 rate={rate}"
    finally:
        _cleanup_c7()


# ─── C8: 向后兼容 ───────────────────────────────────────────────────────────────

def test_c8_ask_tutor_without_user_id():
    """C8: ask_tutor 不传 user_id 时行为与现状一致（返回 answer/sources/critic_triggered）。"""
    import agents.tutor as tutor
    with patch.object(tutor, "retrieve",   return_value=[]), \
         patch.object(tutor, "_llm_chat",  return_value="GMP测试答案"), \
         patch.object(tutor, "log_query"), \
         patch("agents.tutor.SEMANTIC_CACHE_ENABLED", False):
        result = tutor.ask_tutor("GMP测试问题", edu_level=None, history=None)
    assert "answer" in result
    assert "sources" in result
    assert "critic_triggered" in result


def test_c8_ask_tutor_stream_without_user_id():
    """C8: ask_tutor_stream 不传 user_id 时 yield done 信号。"""
    import agents.tutor as tutor
    with patch.object(tutor, "retrieve",            return_value=[]), \
         patch.object(tutor, "_llm_chat",           return_value="测试答案"), \
         patch.object(tutor, "_llm_chat_stream",    return_value=iter([])), \
         patch.object(tutor, "log_query"), \
         patch("agents.tutor.SEMANTIC_CACHE_ENABLED", False):
        chunks = list(tutor.ask_tutor_stream("GMP问题", edu_level=None, history=None))
    done_chunks = [c for c in chunks if '"done": true' in c.lower() or '"done":true' in c.lower()]
    assert done_chunks, "流式版本应有 done 信号"
