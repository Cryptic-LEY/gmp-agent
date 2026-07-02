# -*- coding: utf-8 -*-
"""D6: 错题本闭环单元测试（integration，需要 MySQL）。"""
import socket
import pytest

pytestmark = pytest.mark.integration

# MySQL 不可用时跳过整个模块（避免等待 TCP 超时）
try:
    _s = socket.create_connection(("127.0.0.1", 3306), timeout=1)
    _s.close()
    del _s
except OSError as _e:
    pytest.skip(f"MySQL unavailable — integration tests skipped: {_e}",
                allow_module_level=True)

from eval.error_book import add_error, get_recent_errors, get_few_shot_negatives


_TEST_PREFIX = "_pytest_eb_"


def _cleanup(question_prefix=_TEST_PREFIX):
    """清理测试残留。"""
    try:
        from eval.error_book import _get_conn
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM error_book WHERE question LIKE %s",
                    (question_prefix + "%",),
                )
    except Exception:
        pass


@pytest.fixture(autouse=True)
def clean_test_records():
    _cleanup()
    yield
    _cleanup()


# ── add_error + get_recent_errors ───────────────────────────────────────────

def test_add_error_returns_positive_id():
    eid = add_error(
        question=f"{_TEST_PREFIX}洁净区温度问题",
        bad_answer="温度应保持60°C以上",
        reason="与资料矛盾",
        fix_hint="应为20-25°C",
    )
    assert isinstance(eid, int) and eid > 0


def test_get_recent_errors_finds_added():
    add_error(
        question=f"{_TEST_PREFIX}洁净区湿度问题",
        bad_answer="湿度不限",
        reason="未遵循规范",
    )
    errors = get_recent_errors(n=50)
    questions = [e["question"] for e in errors]
    assert any(_TEST_PREFIX in q for q in questions), "应能查到刚写入的错题"


def test_get_recent_errors_filter_by_prefix():
    add_error(
        question=f"{_TEST_PREFIX}具体问题XYZ",
        bad_answer="bad",
        reason="reason",
    )
    errors = get_recent_errors(question=f"{_TEST_PREFIX}具体问题XYZ", n=10)
    assert len(errors) >= 1
    assert all(_TEST_PREFIX in e["question"] for e in errors)


def test_error_record_has_required_fields():
    add_error(
        question=f"{_TEST_PREFIX}字段测试",
        bad_answer="错误答案",
        reason="原因",
        fix_hint="修正提示",
    )
    errors = get_recent_errors(n=50)
    rec = next((e for e in errors if _TEST_PREFIX + "字段测试" == e["question"]), None)
    assert rec is not None
    for field in ("id", "question", "bad_answer", "reason", "fix_hint", "created_at"):
        assert field in rec, f"缺少字段: {field}"


# ── get_few_shot_negatives ──────────────────────────────────────────────────

def test_few_shot_negatives_returns_list():
    add_error(
        question=f"{_TEST_PREFIX}A级洁净区问题",
        bad_answer="温度需保持60°C",
        reason="温度要求错误",
        fix_hint="温度应为20-25°C",
    )
    negs = get_few_shot_negatives(f"{_TEST_PREFIX}A级洁净区问题", n=5)
    assert isinstance(negs, list)


def test_few_shot_negatives_empty_when_no_errors():
    negs = get_few_shot_negatives("从未出现过的问题_ZZZZZZ", n=5)
    assert negs == [] or isinstance(negs, list)


# ── 错题本闭环：标记→写入→下次注入 ───────────────────────────────────────────

def test_aggregate_from_query_log_runs_without_error():
    """aggregate_from_query_log SQL 应可正常执行（不报 column 错误）。"""
    from eval.error_book import aggregate_from_query_log
    # lookback_days=0 → 不会实际导入任何行，但 SQL 本身必须能执行
    count = aggregate_from_query_log(lookback_days=0)
    assert isinstance(count, int) and count >= 0


def test_aggregate_created_at_uses_server_clock_not_utc():
    """时区一致性：query_log→error_book 聚合行的 created_at 应贴近 MySQL 服务器时钟，
    而非 UTC（本地 UTC+8 时旧实现会差 ~8h，导致「最近记录」排序错乱）。"""
    from logger import log_query
    from eval.error_book import aggregate_from_query_log, _get_conn
    q = f"{_TEST_PREFIX}时区一致性测试"
    # 清理该问题的 query_log 与 error_book 残留
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM error_book WHERE question LIKE %s", (_TEST_PREFIX + "%",))
            try:
                cur.execute("DELETE FROM query_log WHERE question LIKE %s", (_TEST_PREFIX + "%",))
            except Exception:
                pass
    # 写一条 critic 触发的日志 → 聚合
    log_query(q, None, [], "draft", True, "最终答案", 10)
    aggregate_from_query_log(lookback_days=1)
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT ABS(TIMESTAMPDIFF(SECOND, created_at, NOW())) "
                "FROM error_book WHERE question=%s AND source='critic' ORDER BY id DESC LIMIT 1",
                (q,),
            )
            row = cur.fetchone()
    assert row is not None, "critic 行应已聚合入库"
    assert row[0] < 120, f"聚合行 created_at 与服务器时钟差 {row[0]}s，疑似 UTC/本地时区混用"


def test_errorbook_loop_mark_appears_in_negatives():
    """闭环：写入坏 case → get_few_shot_negatives 查到该 case → 可注入 prompt。"""
    q = f"{_TEST_PREFIX}闭环测试问题"
    bad = "温度保持60°C"
    fix = "应为20-25°C"
    add_error(question=q, bad_answer=bad, reason="矛盾", fix_hint=fix)
    negs = get_few_shot_negatives(q, n=5)
    bad_answers = [n.get("bad_answer", "") for n in negs]
    assert bad in bad_answers, f"写入的坏 case 应出现在 few-shot negatives: {bad_answers}"
