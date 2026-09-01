# -*- coding: utf-8 -*-
"""Tutor Agent 的低容量真实 HTTP 并发基线工具。"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import threading
import time
from typing import Callable

import httpx


DEFAULT_URL = "http://127.0.0.1:8001/chat/tutor"
DEFAULT_TIMEOUT_S = 180
DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / "scratch_concurrency_baseline.json"

# 每个并发档位都使用同一组问题；运行不同档位前必须换用全新 API 进程，
# 使进程内语义缓存保持为空，避免缓存命中和问题难度成为混杂变量。
CONTROLLED_QUESTIONS = [
    "在无菌药品生产中，A级区动态环境监测通常应关注哪些项目？",
    "请解释数据完整性中的ALCOA+原则，并给出审计追踪检查重点。",
    "计算机化系统验证中，用户需求说明和风险评估分别有什么作用？",
]

RequestFn = Callable[[str, int], dict]


def post_tutor(
    url: str,
    question: str,
    timeout_s: int,
    post_fn: Callable | None = None,
) -> dict:
    """调用真实 Tutor HTTP 接口，并要求返回内部阶段计时。"""
    sender = post_fn or httpx.post
    response = sender(
        url,
        json={"question": question, "include_timings": True},
        timeout=timeout_s,
    )
    response.raise_for_status()
    return response.json()


def run_level(
    questions: list[str],
    concurrency: int,
    timeout_s: int,
    request_fn: RequestFn,
) -> dict:
    """在有界线程池中运行一档并发，并记录客户端端到端耗时。"""
    if concurrency < 1:
        raise ValueError("concurrency 必须大于等于 1")

    state_lock = threading.Lock()
    active = 0
    max_in_flight = 0

    def run_one(index: int, question: str) -> dict:
        nonlocal active, max_in_flight
        with state_lock:
            active += 1
            max_in_flight = max(max_in_flight, active)

        started = time.perf_counter()
        try:
            response = request_fn(question, timeout_s)
            sample = {
                "index": index,
                "question": question,
                "ok": True,
                "critic_triggered": bool(response.get("critic_triggered", False)),
                "timings_ms": response.get("timings_ms") or {},
                "stage_counts": response.get("stage_counts") or {},
            }
        except Exception as exc:  # noqa: BLE001 - 压测必须将单请求失败计入报告
            sample = {
                "index": index,
                "question": question,
                "ok": False,
                "error_type": type(exc).__name__,
                "error": str(exc),
            }
        finally:
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            with state_lock:
                active -= 1

        sample["latency_ms"] = elapsed_ms
        return sample

    wall_started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [
            executor.submit(run_one, index, question)
            for index, question in enumerate(questions, start=1)
        ]
        samples = [future.result() for future in futures]
    wall_time_ms = int((time.perf_counter() - wall_started) * 1000)

    return {
        "concurrency": concurrency,
        "wall_time_ms": wall_time_ms,
        "max_in_flight": max_in_flight,
        "samples": sorted(samples, key=lambda sample: sample["index"]),
    }


def run_controlled_level(
    concurrency: int,
    timeout_s: int,
    request_fn: RequestFn,
) -> dict:
    """使用固定问题集运行单个并发档位，供独立全新 API 进程调用。"""
    return run_level(
        questions=CONTROLLED_QUESTIONS,
        concurrency=concurrency,
        timeout_s=timeout_s,
        request_fn=request_fn,
    )


def _percentile(values: list[int], fraction: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(math.floor(len(ordered) * fraction), len(ordered) - 1)
    return ordered[index]


def _distribution(values: list[int]) -> dict:
    if not values:
        return {"p50": None, "p95": None, "p99": None, "max": None}
    return {
        "p50": _percentile(values, 0.50),
        "p95": _percentile(values, 0.95),
        "p99": _percentile(values, 0.99),
        "max": max(values),
    }


def _stage_distribution(values: list[int]) -> dict:
    return {
        "mean": round(sum(values) / len(values)),
        "p50": _percentile(values, 0.50),
        "p95": _percentile(values, 0.95),
        "max": max(values),
    }


def summarize_level(level_result: dict) -> dict:
    """汇总一档并发的可靠性、吞吐、延迟和 Agent 阶段指标。"""
    samples = level_result["samples"]
    successes = [sample for sample in samples if sample["ok"]]
    errors = [sample for sample in samples if not sample["ok"]]
    wall_time_s = level_result["wall_time_ms"] / 1000

    stage_values: dict[str, list[int]] = defaultdict(list)
    stage_counts_total: Counter = Counter()
    possible_cache_hits = 0
    for sample in successes:
        for stage, elapsed_ms in sample.get("timings_ms", {}).items():
            if isinstance(elapsed_ms, (int, float)):
                stage_values[stage].append(round(elapsed_ms))
        counts = sample.get("stage_counts", {})
        stage_counts_total.update(counts)
        if counts.get("generate_calls") == 0:
            possible_cache_hits += 1

    return {
        "concurrency": level_result["concurrency"],
        "max_in_flight": level_result["max_in_flight"],
        "requests": len(samples),
        "successes": len(successes),
        "errors": len(errors),
        "success_rate": len(successes) / len(samples) if samples else 0.0,
        "wall_time_ms": level_result["wall_time_ms"],
        "throughput_success_qps": round(len(successes) / wall_time_s, 3) if wall_time_s else 0.0,
        "latency_ms": _distribution([sample["latency_ms"] for sample in samples]),
        "errors_by_type": dict(Counter(sample["error_type"] for sample in errors)),
        "critic_triggered": sum(bool(sample.get("critic_triggered")) for sample in successes),
        "stage_counts_total": dict(stage_counts_total),
        "stage_timings_ms": {
            stage: _stage_distribution(values)
            for stage, values in sorted(stage_values.items())
        },
        "possible_cache_hits": possible_cache_hits,
    }


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="运行 Tutor Agent 的低容量真实并发基线")
    parser.add_argument("--url", default=DEFAULT_URL, help="Tutor HTTP 接口地址")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_S, help="单请求超时秒数")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="JSON 报告路径")
    parser.add_argument(
        "--concurrency",
        type=int,
        choices=(1, 2),
        required=True,
        help="本次只运行一个受控并发档位；另一档必须换用全新 API 进程",
    )
    parser.add_argument(
        "--confirm-paid",
        action="store_true",
        required=True,
        help="确认本次运行会调用真实付费 LLM",
    )
    return parser


def _print_summary(summary: dict) -> None:
    latency = summary["latency_ms"]
    print(
        f"并发={summary['concurrency']}  "
        f"成功={summary['successes']}/{summary['requests']}  "
        f"吞吐={summary['throughput_success_qps']:.3f} QPS  "
        f"P50={latency['p50']}ms  P95={latency['p95']}ms  "
        f"最大并发={summary['max_in_flight']}"
    )


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    print(f"\n开始受控并发档位 {args.concurrency}，请求数 {len(CONTROLLED_QUESTIONS)} ...")
    level_result = run_controlled_level(
        concurrency=args.concurrency,
        timeout_s=args.timeout,
        request_fn=lambda question, timeout_s: post_tutor(
            args.url,
            question,
            timeout_s,
        ),
    )
    summary = summarize_level(level_result)
    _print_summary(summary)

    report = {
        "schema_version": 1,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "url": args.url,
        "timeout_s": args.timeout,
        "total_requests": len(CONTROLLED_QUESTIONS),
        "fresh_api_process_required": True,
        "levels": [{"summary": summary, "samples": level_result["samples"]}],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"报告已保存：{args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
