# -*- coding: utf-8 -*-
"""并发基线工具测试；所有请求均为本地假实现，不访问真实 LLM。"""

from __future__ import annotations

import importlib
import threading

import pytest


def _baseline_module():
    """将模块缺失转成明确的测试失败，保证先观察到 RED。"""
    try:
        return importlib.import_module("eval.concurrency_baseline")
    except ModuleNotFoundError:
        pytest.fail("eval.concurrency_baseline 尚未实现")


def _success_response(total_ms: int, generate_ms: int) -> dict:
    return {
        "answer": "测试答案",
        "sources": ["REG-GMP2010-1"],
        "critic_triggered": False,
        "timings_ms": {
            "memory": 0,
            "embedding": 10,
            "cache_lookup": 1,
            "retrieve": 20,
            "retrieve_rerank": 15,
            "generate": generate_ms,
            "critique": 5,
            "revise": 0,
            "total": total_ms,
        },
        "stage_counts": {
            "retrieve_calls": 1,
            "generate_calls": 1,
            "critique_calls": 1,
            "revise_calls": 0,
        },
    }


def test_post_tutor_requests_internal_timings():
    """若 HTTP 请求漏传 include_timings，压测报告将失去瓶颈诊断数据。"""
    baseline = _baseline_module()
    observed = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return _success_response(total_ms=100, generate_ms=50)

    def fake_post(url, *, json, timeout):
        observed.update(url=url, json=json, timeout=timeout)
        return FakeResponse()

    result = baseline.post_tutor(
        "http://127.0.0.1:8001/chat/tutor",
        "什么是数据完整性？",
        timeout_s=180,
        post_fn=fake_post,
    )

    assert observed == {
        "url": "http://127.0.0.1:8001/chat/tutor",
        "json": {"question": "什么是数据完整性？", "include_timings": True},
        "timeout": 180,
    }
    assert result["timings_ms"]["total"] == 100


def test_run_level_reaches_requested_concurrency_without_exceeding_it():
    """若请求被意外串行化或超出上限，本测试必须失败。"""
    baseline = _baseline_module()
    first_wave = threading.Barrier(2)

    def fake_request(question, timeout_s):
        if question in {"q1", "q2"}:
            first_wave.wait(timeout=1)
        return _success_response(total_ms=100, generate_ms=50)

    result = baseline.run_level(
        questions=["q1", "q2", "q3"],
        concurrency=2,
        timeout_s=180,
        request_fn=fake_request,
    )

    assert len(result["samples"]) == 3
    assert all(sample["ok"] for sample in result["samples"])
    assert result["max_in_flight"] == 2


def test_controlled_levels_reuse_the_same_questions():
    """若两个并发档位使用不同问题，延迟差异就不能归因于并发。"""
    baseline = _baseline_module()
    assert hasattr(baseline, "run_controlled_level"), "尚未提供受控单档压测入口"

    def fake_request(question, timeout_s):
        return _success_response(total_ms=100, generate_ms=50)

    level_one = baseline.run_controlled_level(
        concurrency=1,
        timeout_s=180,
        request_fn=fake_request,
    )
    level_two = baseline.run_controlled_level(
        concurrency=2,
        timeout_s=180,
        request_fn=fake_request,
    )
    expected_questions = [
        "在无菌药品生产中，A级区动态环境监测通常应关注哪些项目？",
        "请解释数据完整性中的ALCOA+原则，并给出审计追踪检查重点。",
        "计算机化系统验证中，用户需求说明和风险评估分别有什么作用？",
    ]

    assert [sample["question"] for sample in level_one["samples"]] == expected_questions
    assert [sample["question"] for sample in level_two["samples"]] == expected_questions


def test_cli_accepts_only_the_two_safe_concurrency_levels():
    """若 CLI 接受更高并发，可能越过本轮已批准的安全范围。"""
    baseline = _baseline_module()

    try:
        args = baseline._build_parser().parse_args(["--confirm-paid", "--concurrency", "2"])
    except SystemExit:
        pytest.fail("CLI 尚未支持选择单个并发档位")

    assert args.concurrency == 2
    with pytest.raises(SystemExit) as exc_info:
        baseline._build_parser().parse_args(["--confirm-paid", "--concurrency", "4"])
    assert exc_info.value.code == 2


def test_summarize_level_reports_errors_percentiles_throughput_and_stages():
    """若错误、百分位数、吞吐或阶段耗时漏算，本测试必须失败。"""
    baseline = _baseline_module()
    level_result = {
        "concurrency": 2,
        "wall_time_ms": 400,
        "max_in_flight": 2,
        "samples": [
            {
                "ok": True,
                "latency_ms": 100,
                "critic_triggered": False,
                "timings_ms": {"total": 90, "generate": 40},
                "stage_counts": {"generate_calls": 1, "revise_calls": 0},
            },
            {
                "ok": True,
                "latency_ms": 200,
                "critic_triggered": True,
                "timings_ms": {"total": 180, "generate": 80},
                "stage_counts": {"generate_calls": 1, "revise_calls": 1},
            },
            {
                "ok": False,
                "latency_ms": 300,
                "error_type": "TimeoutError",
                "error": "request timed out",
            },
        ],
    }

    summary = baseline.summarize_level(level_result)

    assert summary["requests"] == 3
    assert summary["successes"] == 2
    assert summary["errors"] == 1
    assert summary["success_rate"] == pytest.approx(2 / 3)
    assert summary["throughput_success_qps"] == 5.0
    assert summary["latency_ms"] == {"p50": 200, "p95": 300, "p99": 300, "max": 300}
    assert summary["errors_by_type"] == {"TimeoutError": 1}
    assert summary["critic_triggered"] == 1
    assert summary["stage_counts_total"] == {"generate_calls": 2, "revise_calls": 1}
    assert summary["stage_timings_ms"]["generate"] == {
        "mean": 60,
        "p50": 80,
        "p95": 80,
        "max": 80,
    }
    assert summary["possible_cache_hits"] == 0


def test_cli_refuses_paid_run_without_explicit_confirmation(tmp_path):
    """若忘记 --confirm-paid 仍能发请求，可能造成非预期费用。"""
    baseline = _baseline_module()

    with pytest.raises(SystemExit) as exc_info:
        baseline.main([
            "--concurrency", "1",
            "--output", str(tmp_path / "report.json"),
        ])

    assert exc_info.value.code == 2
