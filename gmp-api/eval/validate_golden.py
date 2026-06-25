"""
D2 金标集 schema 校验 + 题数验证。

用法：
  cd gmp-api
  python -m eval.validate_golden
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from config import EVAL_GOLDEN_PATH

REQUIRED_FIELDS = {
    "id": str,
    "question": str,
    "edu_level": (str, type(None)),
    "expect_reg_ids": list,
    "expect_kp_ids": list,
    "answer_points": list,
    "hard_constraints": list,
}

MIN_RECORDS = 30


def validate(path: str | None = None) -> tuple[int, list[str]]:
    """
    校验 golden_set.jsonl。
    返回 (通过题数, 错误列表)。错误列表为空表示全部通过。
    """
    fpath = Path(path or EVAL_GOLDEN_PATH)
    errors: list[str] = []

    if not fpath.exists():
        return 0, [f"文件不存在: {fpath}"]

    records: list[dict] = []
    for lineno, line in enumerate(fpath.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError as e:
            errors.append(f"第{lineno}行 JSON 解析失败: {e}")
            continue
        records.append((lineno, obj))

    ids_seen: set[str] = set()
    for lineno, obj in records:
        prefix = f"GS-{obj.get('id', '?')}（第{lineno}行）"
        for field, expected_type in REQUIRED_FIELDS.items():
            if field not in obj:
                errors.append(f"{prefix} 缺少必填字段: {field}")
                continue
            val = obj[field]
            if not isinstance(val, expected_type):
                errors.append(
                    f"{prefix} 字段 {field} 类型错误: "
                    f"期望 {expected_type}，实际 {type(val).__name__}"
                )
        eid = obj.get("id")
        if eid in ids_seen:
            errors.append(f"{prefix} id 重复: {eid}")
        elif eid:
            ids_seen.add(eid)

        if isinstance(obj.get("answer_points"), list) and not obj["answer_points"]:
            errors.append(f"{prefix} answer_points 不得为空列表")

    n = len(records)
    if n < MIN_RECORDS:
        errors.append(f"题数不足：当前 {n} 题，要求 ≥ {MIN_RECORDS} 题")

    return n, errors


def main():
    n, errors = validate()
    print(f"\n{'='*55}")
    print(f"  eval/validate_golden.py  D2 金标集校验")
    print(f"{'='*55}")
    print(f"  题数：{n}")
    if errors:
        print(f"  错误：{len(errors)} 项")
        for e in errors:
            print(f"    ✗ {e}")
        print(f"\n{'='*55}")
        print("  D2: FAIL")
        print(f"{'='*55}\n")
        sys.exit(1)
    else:
        print(f"  Schema 校验：全部通过")
        print(f"\n{'='*55}")
        print("  D2: PASS")
        print(f"{'='*55}\n")


if __name__ == "__main__":
    main()
