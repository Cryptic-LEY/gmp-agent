"""
05/06 Function Calling：7 步 FC 循环（工具 agent 入口）。

Spec 05 建立基础 FC 循环；Spec 06 接入三层防死循环护栏 + HITL 闸门。

7 步：
  ① 用户问题进入
  ② 携带全部 tool schema 调 LLM（GuardRail.tick 检查步数预算）
  ③ LLM 返回 tool_calls JSON（字条）
  ④ GuardRail.check_action 检查重复；HITL 检查 sensitive 工具授权
  ⑤ dispatch 执行（含 registry 内部退避重试）
  ⑥ 结果 / 错误 / 警告回灌 LLM（role=tool）
  ⑦ LLM 生成终答
"""
from __future__ import annotations

import json
from typing import Callable

import httpx

from config import (
    LLM_BASE_URL, LLM_API_KEY, LLM_MODEL,
    MAX_REASONING_STEPS, TOOLS_ENABLED, TOOL_ARG_RETRY,
    HITL_ENABLED,
)
from agents.router import route_model
from agents.guard import GuardRail, BudgetExceeded
from agents.hitl import request_approval, is_approved_for
from tools.registry import schemas, dispatch, get_tool
from tools.runtime import run_with_retry, ContextObserver
from tools.errors import (
    InvalidArgsError, NotFoundError, ForbiddenError, UpstreamError, ToolTimeoutError,
)
from tools.validation import validate_args


# ── 默认 LLM（OpenAI 兼容 function calling） ─────────────────────────────────

def _llm_with_tools(
    messages: list[dict],
    tool_schemas: list[dict],
    model: str | None = None,
) -> dict:
    """调 DashScope（带 tools 字段）。返回 {"tool_calls": [...]} 或 {"content": str}。"""
    body = {
        "model": model or LLM_MODEL,
        "messages": messages,
        "temperature": 0.3,
        "tools": tool_schemas,
        "tool_choice": "auto",
    }
    resp = httpx.post(
        f"{LLM_BASE_URL}/chat/completions",
        headers={"Authorization": f"Bearer {LLM_API_KEY}"},
        json=body,
        timeout=120,
    )
    resp.raise_for_status()
    choice = resp.json()["choices"][0]["message"]
    if choice.get("tool_calls"):
        return {
            "tool_calls": [
                {
                    "id": tc["id"],
                    "name": tc["function"]["name"],
                    "args": json.loads(tc["function"]["arguments"]),
                }
                for tc in choice["tool_calls"]
            ]
        }
    return {"content": choice.get("content", "")}


# ── 意图路由：答疑 → tutor；做事 → agent ─────────────────────────────────────

_ACTION_KW = ("规划", "路径", "计划", "批改", "作业", "生成", "课件", "练习题",
              "更新画像", "设置目标", "建议学习", "帮我出")


def route_intent(question: str) -> str:
    """简单关键词路由。返回 'agent'（做事/规划）或 'tutor'（问答）。"""
    for kw in _ACTION_KW:
        if kw in question:
            return "agent"
    return "tutor"


# ── 7 步 FC 循环（带 06 护栏） ────────────────────────────────────────────────

def ask_agent(
    question: str,
    user_id: str | None = None,
    authorized: bool = True,
    llm_fn: Callable | None = None,
    pre_approved: set[str] | None = None,
) -> dict:
    """
    7 步 Function Calling 循环入口（Spec 05 基础 + Spec 06 护栏）。

    Args:
        question:     用户问题
        user_id:      用户 ID（传给工具使用）
        authorized:   sensitive 工具基础授权标志
        llm_fn:       (messages, tools) → dict，可注入（测试绕开 DashScope）
        pre_approved: 已通过 HITL 审批的 approval_id 集合（F6 续跑时传入）

    Returns:
        普通结束: {"answer": str, "tool_calls_log": [...], "steps": int}
        HITL 挂起: {"hitl_pending": True, "approval_id": str, "answer": "", ...}
        预算耗尽: {"answer": "[已达上限]...", "tool_calls_log": [...], "steps": int}
    """
    if not TOOLS_ENABLED:
        from agents.tutor import ask_tutor
        r = ask_tutor(question, user_id=user_id)
        return {"answer": r["answer"], "tool_calls_log": [], "steps": 1}

    tool_schemas = schemas()
    _call_llm = llm_fn if llm_fn else _llm_with_tools

    messages: list[dict] = [{"role": "user", "content": question}]
    tool_calls_log: list[dict] = []
    steps = 0
    arg_error_count: dict[str, int] = {}
    disabled_tools: set[str] = set()        # E3：参数反复非法而被程序层停用的工具（用于移除 schema）
    successful_tools: set[str] = set()      # E3：确有一次成功执行的工具
    failed_tools: dict[str, str] = {}       # E3：最近一次结局为失败的工具 → 原因（成功后清除）
    guard = GuardRail()                     # F1/F2/F3：per-invocation 护栏
    observer = ContextObserver()            # F5：上下文增长斜率 + 工具重复观测

    while steps < MAX_REASONING_STEPS:
        steps += 1

        # F5：观测本步上下文增长斜率（斜率异常写入 observer.alerts）
        observer.observe(messages, steps)

        # F1：物理红线（GuardRail 超限抛 BudgetExceeded，此处优雅兜底）
        try:
            guard.tick(messages)
        except BudgetExceeded as e:
            return {
                "answer": f"[已达步数上限] {e}",
                "status": "budget_exceeded",
                "failed_tools": sorted(failed_tools),
                "executed_tools": sorted(successful_tools),
                "tool_calls_log": tool_calls_log,
                "steps": steps,
                "observer_alerts": observer.alerts,
            }

        # ② 调 LLM（已停用的工具不再下发 schema，程序层确定性禁用，而非仅靠文字提示）
        active_schemas = (
            [s for s in tool_schemas if s["function"]["name"] not in disabled_tools]
            if disabled_tools else tool_schemas
        )
        response = _call_llm(messages, active_schemas)
        tool_calls = response.get("tool_calls", [])

        if not tool_calls:
            # E3 终答硬校验（按具体工具）：failed_tools 本身即「最近结局为失败、尚未被
            # 后续成功覆盖」的工具（成功时 pop、失败时写入）。不能再减 successful_tools——
            # 那会把「同一工具先成功后失败」的后一次失败错误地掩盖掉。
            unresolved = sorted(failed_tools)
            if unresolved:
                status = "partial_failure" if successful_tools else "tool_failed"
                answer = (
                    f"操作未完全完成。失败工具：{unresolved}"
                    + (f"；已执行工具：{sorted(successful_tools)}" if successful_tools else "")
                    + "。请补充必要信息后重试，或改用其他方式。"
                )
            else:
                status = "ok"
                answer = response.get("content", "")
            return {
                "answer": answer,
                "status": status,
                "failed_tools": unresolved,
                "executed_tools": sorted(successful_tools),
                "tool_calls_log": tool_calls_log,
                "steps": steps,
                "observer_alerts": observer.alerts,
            }

        # ③ 加入对话历史
        messages.append({
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["name"],
                        "arguments": json.dumps(tc["args"], ensure_ascii=False),
                    },
                }
                for tc in tool_calls
            ],
        })

        # ④⑤⑥ 逐工具：护栏检查 → HITL → 参数校验 → 执行 → 回灌
        for tc in tool_calls:
            name = tc["name"]
            args = tc["args"]
            tc_id = tc["id"]
            tool_calls_log.append({"name": name, "step": steps})

            # E3：已停用工具即使被模型再次调用也不执行（程序层兜底，防绕过 schema 移除）
            if name in disabled_tools:
                messages.append({"role": "tool", "tool_call_id": tc_id,
                                 "content": f"[工具 {name!r} 已停用，忽略本次调用，请改用其他方式。]"})
                continue

            # F5：记录工具重复调用（连续重复计数，供可观测性）
            observer.record_repeat(name)

            # F2：动作哈希重复检测
            loop_warning = guard.check_action(name, args)
            if loop_warning:
                # 注入强刺激提示，回退消息到上一个正常决策点
                rolled = guard.rollback()
                if rolled is not None:
                    messages = rolled
                messages.append({
                    "role": "system",
                    "content": loop_warning,
                })
                # 不执行此次工具调用，让 LLM 重新决策
                break

            t = get_tool(name)
            if t is None:
                failed_tools[name] = "NotFound：工具未注册"
                messages.append({
                    "role": "tool", "tool_call_id": tc_id,
                    "content": f"[NotFound] 工具 {name!r} 未注册，请换用其他工具。",
                })
                continue

            # 强制注入 user_id：覆盖 LLM 可能主动填写的错误 user_id（防身份伪造）
            if user_id and "user_id" in t.parameters.get("properties", {}):
                args = {**args, "user_id": user_id}

            # F6：HITL 闸门（sensitive 工具执行前检查授权，绑定 tool_name+args_hash+user_id）
            if t.level == "sensitive" and HITL_ENABLED:
                already_ok = pre_approved and any(
                    is_approved_for(aid, name, args=args, user_id=user_id)
                    for aid in pre_approved
                )
                if not already_ok:
                    approval_id = request_approval(name, args, user_id=user_id)
                    return {
                        "hitl_pending": True,
                        "status": "hitl_pending",
                        "approval_id": approval_id,
                        "pending_tool": name,
                        "answer": "",
                        "tool_calls_log": tool_calls_log,
                        "steps": steps,
                        "observer_alerts": observer.alerts,
                    }

            # E3：参数校验（InvalidArgs → 回灌 → LLM 自修正，上限 TOOL_ARG_RETRY）
            try:
                validate_args(t.parameters, args)
            except InvalidArgsError as e:
                arg_error_count[name] = arg_error_count.get(name, 0) + 1
                count = arg_error_count[name]
                failed_tools[name] = f"参数校验失败：{e}"   # 标记失败（后续成功会清除）
                if count > TOOL_ARG_RETRY:
                    # 程序层停用该工具：下一轮不再下发其 schema（确定性，非概率）
                    disabled_tools.add(name)
                    content = (
                        f"[InvalidArgs 超过最大重试次数 {TOOL_ARG_RETRY}，"
                        f"工具 {name!r} 已停用，本轮不可再调用。]"
                    )
                    messages.append({"role": "tool", "tool_call_id": tc_id, "content": content})
                    # 强系统约束：禁止虚报成功，明确后续应对（追问/换工具/如实说明失败）
                    messages.append({"role": "system", "content": (
                        f"工具 {name!r} 因参数反复非法已被停用，无法执行。"
                        "严禁声称该操作已完成或已成功。"
                        "接下来请：若缺少必要信息，向用户追问；"
                        "若有其他可用工具可达成目标，改用其他工具；"
                        "否则如实告知用户该操作未能完成，不要编造结果。"
                    )})
                    continue
                remaining = TOOL_ARG_RETRY - count
                content = (
                    f"[InvalidArgs] 参数错误：{e}，"
                    f"请修正后重试（剩余次数：{remaining}）。"
                )
                messages.append({"role": "tool", "tool_call_id": tc_id, "content": content})
                continue

            # F4：执行（run_with_retry 对 Upstream5xx/Timeout 做 1s/2s/4s 退避，每次失败回灌模型）
            retry_log: list[str] = []

            def _on_retry(attempt: int, err_msg: str) -> None:
                retry_log.append(
                    f"[工具重试 {attempt + 1}] {err_msg}，退避后重试..."
                )

            try:
                # 非幂等（sensitive/写）工具超时不重试：避免超时旧线程 + 重试重复副作用
                result = run_with_retry(
                    lambda **_: dispatch(name, args, authorized=authorized),
                    {},
                    on_retry=_on_retry,
                    retry_on_timeout=(t.level != "sensitive"),
                )
                # 先注入每次退避的错误消息（F4：每次失败回灌模型）
                for rm in retry_log:
                    messages.append({"role": "tool", "tool_call_id": tc_id, "content": rm})
                successful_tools.add(name)      # E3：成功执行
                failed_tools.pop(name, None)    # E3：清除该工具此前的失败标记
                content = (
                    result if isinstance(result, str)
                    else json.dumps(result, ensure_ascii=False)
                )
            except NotFoundError as e:
                content = f"[NotFound] {e}，请换用其他方式。"
                failed_tools[name] = f"NotFound：{e}"
            except ForbiddenError as e:
                content = f"[Forbidden] {e}，该操作需要用户授权。"
                failed_tools[name] = f"Forbidden：{e}"
            except (UpstreamError, ToolTimeoutError) as e:
                for rm in retry_log:
                    messages.append({"role": "tool", "tool_call_id": tc_id, "content": rm})
                retried = len(retry_log)
                content = f"[工具故障] {e}，已重试 {retried} 次，服务暂时不可用。"
                failed_tools[name] = f"上游/超时：{e}"
            except Exception as e:
                content = f"[Error] 工具执行失败：{e}"
                failed_tools[name] = f"执行异常：{e}"

            messages.append({
                "role": "tool", "tool_call_id": tc_id,
                "content": content,
            })

    # E7：步数耗尽（MAX_REASONING_STEPS 软上限）
    return {
        "answer": f"[已达 {MAX_REASONING_STEPS} 步上限] 当前进度见工具调用日志。",
        "status": "max_steps",
        "failed_tools": sorted(failed_tools),
        "executed_tools": sorted(successful_tools),
        "tool_calls_log": tool_calls_log,
        "steps": steps,
        "observer_alerts": observer.alerts,
    }
