"""
F7 MCP 冒烟测试（需先启动 mcp/server.py）。

用法：
    # 终端 1
    MCP_ENABLED=true python -m mcp.server &

    # 终端 2（Windows: set MCP_ENABLED=true && python -m mcp.smoke）
    python -m mcp.smoke
"""
from __future__ import annotations

import json
import sys
import urllib.request
import urllib.error

BASE = "http://localhost:8002"


def _get(path: str) -> dict:
    with urllib.request.urlopen(f"{BASE}{path}") as r:
        return json.loads(r.read())


def _post(path: str, data: dict) -> tuple[int, dict]:
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{BASE}{path}", data=body,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def main() -> None:
    results: list[tuple[str, bool, str]] = []

    def check(label: str, ok: bool, detail: str = "") -> None:
        status = "[PASS]" if ok else "[FAIL]"
        print(f"  {status} {label}" + (f" — {detail}" if detail else ""))
        results.append((label, ok, detail))

    print("=== F7 MCP 冒烟测试 ===\n")

    # list_tools
    try:
        data = _get("/mcp/tools")
        tools = data.get("tools", [])
        names = [t["name"] for t in tools]
        check("list_tools 返回非空", len(tools) > 0, f"{len(tools)} 个工具")
        check("search_regulation 在工具列表", "search_regulation" in names)
        check("plan_learning_path 在工具列表", "plan_learning_path" in names)
    except Exception as e:
        check("list_tools", False, str(e))

    # list_resources
    try:
        data = _get("/mcp/resources")
        resources = data.get("resources", [])
        uris = [r["uri"] for r in resources]
        check("list_resources 返回非空", len(resources) > 0)
        check("reg_library schema 资源存在", "gmp://schema/reg_library" in uris)
    except Exception as e:
        check("list_resources", False, str(e))

    # list_prompts
    try:
        data = _get("/mcp/prompts")
        prompts = data.get("prompts", [])
        names = [p["name"] for p in prompts]
        check("list_prompts 返回非空", len(prompts) > 0)
        check("gmp_tutor prompt 存在", "gmp_tutor" in names)
    except Exception as e:
        check("list_prompts", False, str(e))

    # 越权资源访问（沙盒拒绝）
    try:
        code, data = _post("/mcp/resources/read", {"uri": "/etc/passwd"})
        check("非法 URI 被沙盒拒绝（403）", code == 403, f"code={code}")
    except Exception as e:
        check("非法 URI 沙盒", False, str(e))

    # 未声明字段注入（沙盒拒绝）
    try:
        code, data = _post("/mcp/tools/call", {
            "name": "search_regulation",
            "arguments": {"query": "洁净区", "__inject__": "evil"},
        })
        check("未声明字段注入被拒绝（400）", code == 400, f"code={code}")
    except Exception as e:
        check("字段注入沙盒", False, str(e))

    print()
    total = len(results)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"结果：{passed}/{total} PASS")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
