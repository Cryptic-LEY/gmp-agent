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


# 目标 → 所需工具能力绑定（确定性关键词规则）。
# 每条 = (对象词集合, 动作词集合, 完成该目标必须成功的工具集合)。
# 命中一条则该目标需要其工具集合中「至少一个」成功执行——只读辅助工具成功不算数。
# 注意：这是关键词级绑定，只覆盖已定义的动作动词，无法覆盖任意自然语言表述（诚实边界）。
_GOAL_RULES: list[tuple[tuple[str, ...], tuple[str, ...], set[str]]] = [
    (("画像", "档案", "偏好", "薄弱", "学习目标"),
     ("更新", "修改", "设置", "调整", "改一下", "改成"),
     {"update_user_profile"}),
    (("课件", "教案", "讲义"),
     ("生成", "制作", "做一份", "出一份", "帮我做"),
     {"generate_courseware"}),
    (("作业", "答卷", "提交的"),
     ("批改", "评分", "批阅", "打分"),
     {"review_assignment"}),
    (("路径", "学习计划", "学习方案", "学习路线"),
     ("规划", "制定", "安排", "帮我", "生成"),
     {"plan_learning_path"}),
]


def _required_tool_groups(question: str) -> list[set[str]]:
    """从问题解析出「完成目标必须成功的工具组」列表（命中的每条规则一组）。"""
    groups: list[set[str]] = []
    for objs, acts, tools in _GOAL_RULES:
        if any(o in question for o in objs) and any(a in question for a in acts):
            groups.append(set(tools))
    return groups


# 工具契约：handler 的业务失败**应当抛出** tools.errors 里的分类异常
# （NotFound/Forbidden/Upstream/Timeout/InvalidArgs）。若 handler 违反契约、用返回值
# 表达失败（ok=false / success=false / error / status∈失败集），下面的兜底会将其判为失败，
# 避免业务失败被记成功。注意：正常返回不得使用这些失败语义键（现有内置工具均未使用）。
_FAILURE_STATUS = {"failed", "error", "failure", "fail"}


def _result_signals_failure(result) -> str | None:
    """检测 handler 用返回值（而非异常）表达的业务失败，返回原因；无则 None。"""
    if isinstance(result, dict):
        if result.get("ok") is False:
            return f"handler 返回 ok=false：{result.get('error') or result.get('message') or ''}".strip("：")
        if result.get("success") is False:
            return "handler 返回 success=false"
        if result.get("error"):
            return f"handler 返回 error：{result.get('error')}"
        if str(result.get("status", "")).lower() in _FAILURE_STATUS:
            return f"handler 返回 status={result.get('status')}"
    return None


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
    required_groups = _required_tool_groups(question)  # E3：完成用户目标必须成功的工具组
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
            # E3 终答硬校验：
            #  - unresolved：结局为失败、未被后续成功覆盖的工具（failed_tools 即真相源）。
            #  - unmet_required：完成用户目标必须成功的工具组中，没有任何一个成功的组
            #    （只读辅助工具成功不算数——目标—工具—证据绑定，堵「无关工具成功冒充完成」）。
            unresolved = sorted(failed_tools)
            unmet_required = sorted({
                t for grp in required_groups if not (grp & successful_tools) for t in grp
            })
            if unresolved or unmet_required:
                status = "partial_failure" if successful_tools else "tool_failed"
                problem = sorted(set(unresolved) | set(unmet_required))
                answer = (
                    f"操作未完成。缺少执行证据的必要工具：{problem}"
                    + (f"；已执行工具：{sorted(successful_tools)}" if successful_tools else "")
                    + "。请补充必要信息后重试，或改用其他方式。"
                )
            elif not successful_tools:
                # 无目标绑定且全程未执行任何工具：程序无法证伪文本，但确定性暴露「无执行证据」，
                # 交由调用方对「行动类任务的成功声明」施加确认策略。不覆盖答案文本。
                status = "no_tool_executed"
                answer = response.get("content", "")
            else:
                status = "ok"
                answer = response.get("content", "")
            return {
                "answer": answer,
                "status": status,
                "failed_tools": unresolved,
                "unmet_required_tools": unmet_required,
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
                # 工具契约兜底：handler 用返回值表达的业务失败，判为失败而非成功
                soft_fail = _result_signals_failure(result)
                if soft_fail:
                    failed_tools[name] = f"业务失败：{soft_fail}"
                    content = f"[工具业务失败] {name}：{soft_fail}"
                else:
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
