"""工具执行异常分类（文档 10 雷点三：按错误类型定制应对，非全部重试）。"""


class ToolError(Exception):
    """所有工具异常的基类。"""


class InvalidArgsError(ToolError):
    """参数不合法 → 回灌 LLM 自修正（最多 TOOL_ARG_RETRY 次）。"""


class NotFoundError(ToolError):
    """资源不存在 → 告知模型换策略，不重试。"""


class UpstreamError(ToolError):
    """上游 5xx / 超时 → 指数退避重试（最多 3 次）。"""


class ForbiddenError(ToolError):
    """Sensitive 工具未授权 → 停止 + HITL（06 处理）。"""
