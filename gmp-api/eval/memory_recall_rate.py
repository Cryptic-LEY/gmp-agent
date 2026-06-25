# -*- coding: utf-8 -*-
"""
C7 验收：命中率统计
memory_usage 表被写入，可统计「注入记忆被用到」的比例。

运行方式：
    cd gmp-api
    python -m eval.memory_recall_rate
"""
from __future__ import annotations
import sys


_TEST_USER = "_spec03_c7_eval_"
_TEST_SESSION = "_c7_eval_sess_"


def _cleanup():
    try:
        from memory.metrics import _get_conn
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM memory_usage WHERE user_id = %s", (_TEST_USER,)
                )
    except Exception:
        pass


def run_c7_memory_recall_rate():
    """
    C7: 写入多条 memory_usage 记录，验证命中率统计正确。
    """
    from memory.metrics import log_memory_usage, get_hit_rate

    _cleanup()

    cases = [
        # (entities, answer, expected_hit)
        (["洁净区", "A级区"],  "洁净区的A级区是最高级别环境",  True),
        (["无菌操作"],         "无菌操作需要在A级区进行",       True),
        (["批记录"],           "今天天气很好，完全无关内容",    False),
        (["文件管理"],         "文件管理要求记录完整",           True),
        (["GMP原则"],          "这个问题和注入词毫无关系",       False),
    ]

    for entities, answer, _ in cases:
        log_memory_usage(_TEST_USER, entities, answer, _TEST_SESSION)

    rate = get_hit_rate(_TEST_USER)
    expected_hits = sum(1 for _, _, hit in cases if hit)
    expected_rate = expected_hits / len(cases)

    print(f"\n[C7 Memory Recall Rate]")
    print(f"  写入记录:   {len(cases)} 条")
    print(f"  预期命中:   {expected_hits} 条 (rate={expected_rate:.0%})")
    print(f"  实测命中率: {rate:.0%}")

    # 允许 ±1 条误差（启发式匹配不完美）
    tolerance = 1 / len(cases)
    passed = abs(rate - expected_rate) <= tolerance + 0.01
    status = "PASS" if passed else "FAIL"
    print(f"[C7] 命中率统计可用（误差 ≤ {tolerance+0.01:.0%}）: {status}")

    _cleanup()
    return passed


def run_c7_global_stats():
    """C7 补充: 全局命中率查询不崩溃，返回 [0, 1] 浮点数。"""
    from memory.metrics import get_hit_rate
    rate = get_hit_rate()
    passed = 0.0 <= rate <= 1.0
    status = "PASS" if passed else "FAIL"
    print(f"[C7] 全局命中率合法范围: {status} (rate={rate:.0%})")
    return passed


def main():
    print("=" * 55)
    print("  eval/memory_recall_rate.py — C7 验收")
    print("=" * 55)

    results = {
        "C7_recall_rate":  run_c7_memory_recall_rate(),
        "C7_global_stats": run_c7_global_stats(),
    }

    print("\n" + "=" * 55)
    all_pass = all(results.values())
    for k, v in results.items():
        print(f"  {k}: {'PASS' if v else 'FAIL'}")
    print("=" * 55)
    print(f"  总体: {'ALL PASS' if all_pass else 'FAILED'}")
    print("=" * 55)

    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
