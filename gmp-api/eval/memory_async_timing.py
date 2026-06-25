# -*- coding: utf-8 -*-
"""
C2 验收：异步不阻塞
即使后台写库耗时 200ms，ask_tutor 主响应时间不因记忆写入增加 > 50ms。

运行方式：
    cd gmp-api
    python -m eval.memory_async_timing
"""
from __future__ import annotations
import sys
import time
from unittest.mock import patch


def run_c2_async_does_not_block():
    """
    对比：
      - ask_tutor(user_id=None)：无记忆，纯 LangGraph 基线
      - ask_tutor(user_id="_c2_test_")：有记忆，后台模拟 200ms 写库
    断言：两者差值 < 50ms，证明记忆写入不阻塞主响应。
    """
    import agents.tutor as tutor

    def _slow_background(*args, **kwargs):
        """模拟后台耗时 200ms 的 LLM 抽取 + 写库。"""
        time.sleep(0.2)

    common_patches = [
        patch.object(tutor, "retrieve",   return_value=[]),
        patch.object(tutor, "_llm_chat",  return_value="GMP测试答案"),
        patch.object(tutor, "log_query"),
        patch("agents.tutor.SEMANTIC_CACHE_ENABLED", False),
    ]

    # 基线：无 user_id
    with common_patches[0], common_patches[1], common_patches[2], common_patches[3]:
        t0 = time.perf_counter()
        tutor.ask_tutor("测试", edu_level=None, history=None)
        t_baseline_ms = (time.perf_counter() - t0) * 1000

    # 有记忆：后台模拟慢写库，主线程不等
    mem_patches = common_patches + [
        patch("memory.profile._async_extract_and_upsert", side_effect=_slow_background),
        patch("agents.tutor.MEMORY_ENABLED", True),
        patch("memory.profile.get_profile", return_value={}),
        patch("memory.metrics.log_memory_usage"),
    ]
    with (mem_patches[0], mem_patches[1], mem_patches[2], mem_patches[3],
          mem_patches[4], mem_patches[5], mem_patches[6], mem_patches[7]):
        t1 = time.perf_counter()
        tutor.ask_tutor("测试", edu_level=None, history=None, user_id="_c2_test_")
        t_memory_ms = (time.perf_counter() - t1) * 1000

    extra_ms = t_memory_ms - t_baseline_ms
    print(f"\n[C2 Async Timing]")
    print(f"  基线（无记忆）: {t_baseline_ms:.1f}ms")
    print(f"  有记忆路径:     {t_memory_ms:.1f}ms  (后台模拟 200ms 写库)")
    print(f"  额外开销:       {extra_ms:.1f}ms")

    passed = extra_ms < 50
    status = "PASS" if passed else "FAIL"
    print(f"[C2] 主响应额外开销 < 50ms: {status} (extra={extra_ms:.1f}ms)")
    return passed


def main():
    print("=" * 55)
    print("  eval/memory_async_timing.py — C2 验收")
    print("=" * 55)

    result = run_c2_async_does_not_block()

    print("\n" + "=" * 55)
    print(f"  C2: {'PASS' if result else 'FAIL'}")
    print("=" * 55)

    sys.exit(0 if result else 1)


if __name__ == "__main__":
    main()
