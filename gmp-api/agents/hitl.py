"""
06 HITL（Human-In-The-Loop）闸门。

approval_id 绑定到具体的 tool_name，防止"已审批工具A的ID"被滥用于放行工具B。

工作流：
  1. ask_agent 遇到 sensitive 工具 → request_approval(tool_name, args) → approval_id
  2. 前端弹窗展示 → 用户点确认 → POST /agent/approve {approval_id}
  3. 后端调 approve(approval_id) → 绑定放行记录 {approval_id: tool_name}
  4. 客户端携带 pre_approved={approval_id} 重发 → is_approved_for(approval_id, tool_name) 验证
"""
from __future__ import annotations

import uuid

_pending: dict[str, dict] = {}              # approval_id → record
_approved: dict[str, str] = {}             # approval_id → tool_name（绑定放行）


def request_approval(tool_name: str, args: dict) -> str:
    """
    为 sensitive 工具调用创建待确认记录。
    返回 approval_id（12 位 UUID 前缀，碰撞概率足够低）。
    """
    approval_id = str(uuid.uuid4())[:12]
    _pending[approval_id] = {
        "tool_name": tool_name,
        "args": args,
        "status": "pending",
    }
    return approval_id


def is_approved(approval_id: str) -> bool:
    """检查 approval_id 是否已被放行（不验证 tool_name，仅供通用状态查询）。"""
    return approval_id in _approved


def is_approved_for(approval_id: str, tool_name: str) -> bool:
    """
    验证 approval_id 是否已被放行，且绑定的 tool_name 与当前工具一致。
    防止已审批工具 A 的 ID 被用于绕过工具 B 的 HITL 审核。
    """
    return _approved.get(approval_id) == tool_name


def approve(approval_id: str) -> bool:
    """放行指定审批请求（绑定到对应 tool_name）。成功返回 True；ID 不存在返回 False。"""
    if approval_id not in _pending:
        return False
    tool_name = _pending[approval_id]["tool_name"]
    _pending[approval_id]["status"] = "approved"
    _approved[approval_id] = tool_name       # 绑定 tool_name
    return True


def get_pending() -> list[dict]:
    """返回所有还未放行的待确认动作列表（供前端轮询）。"""
    return [
        {"id": k, **v}
        for k, v in _pending.items()
        if v["status"] == "pending"
    ]


def reset() -> None:
    """清除所有状态（仅供测试使用）。"""
    _pending.clear()
    _approved.clear()
