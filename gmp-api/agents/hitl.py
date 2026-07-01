"""
06 HITL（Human-In-The-Loop）闸门。

approval_id 绑定到 (tool_name, args_hash, user_id)，防多维重放：
  - tool_name：防止"已审批工具A的ID"被滥用于放行工具B
  - args_hash：防止审批参数A被替换成参数B执行
  - user_id：防止跨用户重放（approval 记录无 user_id 时跳过验证，向后兼容）
  - 一次性消费：is_approved_for 成功后立即删除，防重放攻击
  - TTL：_APPROVAL_TTL 秒内未消费自动失效

工作流：
  1. ask_agent 遇到 sensitive 工具 → request_approval(tool_name, args, user_id) → approval_id
  2. 前端弹窗展示 → 用户点确认 → POST /agent/approve {approval_id}
  3. 后端调 approve(approval_id) → 绑定放行记录 {tool_name, args_hash, user_id, ts}
  4. 客户端携带 pre_approved={approval_id} 重发 → is_approved_for(...) 验证并消费
"""
from __future__ import annotations

import hashlib
import json
import time
import uuid

_pending: dict[str, dict] = {}   # approval_id → {tool_name, args, args_hash, user_id, status}
_approved: dict[str, dict] = {}  # approval_id → {tool_name, args_hash, user_id, ts}

_APPROVAL_TTL = 600  # 10 分钟内有效


def _args_hash(args: dict) -> str:
    """对工具参数做确定性哈希（SHA-256 前16位十六进制）。"""
    serialized = json.dumps(args, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(serialized.encode()).hexdigest()[:16]


def request_approval(tool_name: str, args: dict, user_id: str | None = None) -> str:
    """
    为 sensitive 工具调用创建待确认记录。
    返回 approval_id（UUID4 前12位）。
    """
    approval_id = str(uuid.uuid4())[:12]
    _pending[approval_id] = {
        "tool_name": tool_name,
        "args": args,
        "args_hash": _args_hash(args),
        "user_id": user_id,
        "status": "pending",
    }
    return approval_id


def is_approved(approval_id: str) -> bool:
    """检查 approval_id 是否已被放行（不验证 tool_name，仅供通用状态查询）。"""
    return approval_id in _approved


def is_approved_for(
    approval_id: str,
    tool_name: str,
    args: dict | None = None,
    user_id: str | None = None,
) -> bool:
    """
    验证 approval_id 是否有效，通过后立即消费（一次性使用，防重放攻击）。

    - tool_name 必须与审批时绑定的一致
    - args 非空时做 args_hash 校验（防参数替换攻击）
    - user_id 非空且 approval 记录中有 user_id 时做身份校验（防跨用户重放）
    - TTL 超时后自动失效
    - 任何验证失败均不消费（仅成功后删除）
    """
    entry = _approved.get(approval_id)
    if entry is None:
        return False

    # TTL 检查
    if time.time() - entry["ts"] > _APPROVAL_TTL:
        del _approved[approval_id]
        return False

    # tool_name 绑定
    if entry["tool_name"] != tool_name:
        return False

    # args_hash 校验（调用方提供 args 时才校验）
    if args is not None and entry.get("args_hash") and entry["args_hash"] != _args_hash(args):
        return False

    # user_id 校验（双方都有值时才校验，保持向后兼容）
    if (user_id is not None
            and entry.get("user_id") is not None
            and entry["user_id"] != user_id):
        return False

    # 一次性消费：删除防重放
    del _approved[approval_id]
    return True


def approve(approval_id: str) -> bool:
    """放行指定审批请求（绑定 tool_name + args_hash + user_id + ts）。
    成功返回 True；ID 不存在返回 False。"""
    if approval_id not in _pending:
        return False
    rec = _pending[approval_id]
    rec["status"] = "approved"
    _approved[approval_id] = {
        "tool_name": rec["tool_name"],
        "args_hash": rec.get("args_hash", ""),
        "user_id": rec.get("user_id"),
        "ts": time.time(),
    }
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
