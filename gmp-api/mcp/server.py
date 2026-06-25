"""
06 MCP Server（可选，MCP_ENABLED=false 默认关闭）。

把 05 的工具注册表按 MCP 三原语暴露：
  Tools      → registry 中的 safe 工具（sensitive 工具在沙盒下暴露）
  Resources  → gmp 库 schema 摘要 + 法规片段（只读）
  Prompts    → GMP 审核专家 / GMP 答疑助手 母板

启动方式（需先设 MCP_ENABLED=true）：
    python -m mcp.server          # 启动内置 HTTP server（默认 :8002）
    python -m mcp.smoke           # F7 冒烟测试

权限沙盒：
  - 工具调用前校验参数边界（白名单字段 + 类型）
  - 禁止执行任意命令 / 越权写库
  - sensitive 工具暴露为"需授权"状态，未授权时返回 403
"""
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

from config import MCP_ENABLED
from tools.registry import schemas, dispatch, get_tool
from tools.errors import ForbiddenError


# ── MCP 三原语定义 ─────────────────────────────────────────────────────────────

def list_tools() -> list[dict]:
    """返回所有工具的 MCP Tool 描述（safe + sandboxed sensitive）。"""
    result = []
    for s in schemas():
        fn = s["function"]
        tool = get_tool(fn["name"])
        entry = {
            "name": fn["name"],
            "description": fn["description"],
            "inputSchema": fn["parameters"],
            "level": tool.level if tool else "safe",
        }
        result.append(entry)
    return result


def list_resources() -> list[dict]:
    """返回只读资源：库 schema + 法规片段示例。"""
    return [
        {
            "uri": "gmp://schema/reg_library",
            "name": "reg_library 表结构",
            "description": "GMP 法规库主表字段说明（只读）",
            "mimeType": "application/json",
        },
        {
            "uri": "gmp://schema/knowledge_points",
            "name": "knowledge_points 表结构",
            "description": "GMP 知识点表字段说明（只读）",
            "mimeType": "application/json",
        },
        {
            "uri": "gmp://regulation/sample",
            "name": "法规片段示例",
            "description": "从 reg_library 随机抽取的法规条文示例（只读）",
            "mimeType": "text/plain",
        },
    ]


def list_prompts() -> list[dict]:
    """返回预设 Prompt 模板（抽取自 tutor.py system prompt）。"""
    return [
        {
            "name": "gmp_auditor",
            "description": "GMP 法规审核专家母板",
            "arguments": [{"name": "topic", "description": "审核主题", "required": False}],
        },
        {
            "name": "gmp_tutor",
            "description": "GMP 答疑助手母板（含逐字引用约束）",
            "arguments": [{"name": "edu_level", "description": "学历层次", "required": False}],
        },
    ]


def get_resource(uri: str) -> str:
    """读取只读资源内容（F7 沙盒：只允许 gmp:// 前缀，禁止任意路径）。"""
    if not uri.startswith("gmp://"):
        raise PermissionError(f"资源 URI {uri!r} 不在白名单内，拒绝访问")

    if uri == "gmp://schema/reg_library":
        return json.dumps({
            "table": "reg_library",
            "columns": ["id", "chapter", "section", "article", "content",
                        "doc_type", "edu_level", "embedding"],
        })
    if uri == "gmp://schema/knowledge_points":
        return json.dumps({
            "table": "knowledge_points",
            "columns": ["id", "kp_code", "name", "description", "chapter",
                        "edu_level", "difficulty"],
        })
    if uri == "gmp://regulation/sample":
        return "【GMP2010 第十一章第一百七十一条】（示例）洁净区的空气洁净度分为A、B、C、D级。"
    raise KeyError(f"未知资源 {uri!r}")


def call_tool_sandboxed(name: str, args: dict, authorized: bool = False) -> Any:
    """
    沙盒模式工具调用：
    - 只允许白名单工具
    - sensitive 工具未授权时返回 ForbiddenError
    - 参数只允许已知字段（防注入）
    """
    t = get_tool(name)
    if t is None:
        raise KeyError(f"工具 {name!r} 不在注册表中")

    # 沙盒：字段白名单（只允许 schema 中声明的 properties）
    allowed_keys = set(t.parameters.get("properties", {}).keys())
    extra = set(args.keys()) - allowed_keys
    if extra:
        raise ValueError(f"参数包含未声明字段 {extra}，沙盒拒绝")

    return dispatch(name, args, authorized=authorized)


# ── 极简 HTTP Server（JSON-RPC over HTTP） ──────────────────────────────────────

class MCPHandler(BaseHTTPRequestHandler):
    """极简 MCP HTTP 处理器（JSON-RPC 风格）。"""

    def log_message(self, fmt: str, *args: Any) -> None:
        pass  # 静默日志

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/mcp/tools":
            self._send_json({"tools": list_tools()})
        elif self.path == "/mcp/resources":
            self._send_json({"resources": list_resources()})
        elif self.path == "/mcp/prompts":
            self._send_json({"prompts": list_prompts()})
        else:
            self._send_json({"error": "not found"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")

        if self.path == "/mcp/resources/read":
            uri = body.get("uri", "")
            try:
                content = get_resource(uri)
                self._send_json({"content": content})
            except PermissionError as e:
                self._send_json({"error": str(e)}, 403)
            except KeyError as e:
                self._send_json({"error": str(e)}, 404)

        elif self.path == "/mcp/tools/call":
            tool_name = body.get("name", "")
            args = body.get("arguments", {})
            authorized = body.get("authorized", False)
            try:
                result = call_tool_sandboxed(tool_name, args, authorized=authorized)
                self._send_json({"result": result})
            except ForbiddenError as e:
                self._send_json({"error": str(e)}, 403)
            except (KeyError, ValueError) as e:
                self._send_json({"error": str(e)}, 400)
            except Exception as e:
                self._send_json({"error": str(e)}, 500)

        else:
            self._send_json({"error": "not found"}, 404)

    def _send_json(self, data: dict, code: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def start_server(host: str = "localhost", port: int = 8002) -> None:
    if not MCP_ENABLED:
        print("[MCP] MCP_ENABLED=false，跳过启动")
        return
    server = HTTPServer((host, port), MCPHandler)
    print(f"[MCP] Server 已启动：http://{host}:{port}/mcp/")
    server.serve_forever()


if __name__ == "__main__":
    start_server()
