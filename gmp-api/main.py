"""
GMP Agent FastAPI 后端
运行方式：cd gmp-api && uvicorn main:app --reload --port 8001
"""
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agents.tutor import ask_tutor, ask_tutor_stream
from agents.tool_agent import ask_agent, route_intent
from agents.hitl import approve as hitl_approve, get_pending as hitl_pending
from config import HITL_API_KEY
from rag import vector_index

app = FastAPI(title="GMP Agent API", version="0.1.0")


@app.on_event("startup")
def _build_vector_index() -> None:
    """启动时一次性构建进程内向量索引；失败则降级（retriever 自带关键词兜底）。"""
    try:
        idx = vector_index.rebuild()
        print(f"[startup] 向量索引就绪：{idx.size} 条")
    except Exception as e:  # noqa: BLE001
        print(f"[startup] 向量索引构建失败，降级运行：{e}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js开发服务器
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 请求/响应模型 ──────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    question: str
    edu_level: str | None = None                # '专科' | '本科' | None
    history: list[dict] | None = None           # [{role, content}, ...]，前端传最近N轮
    user_id: str | None = None                  # 用户 ID（有值时启用四层记忆）


class ChatResponse(BaseModel):
    answer: str
    sources: list[str]
    critic_triggered: bool


class AgentRequest(BaseModel):
    question: str
    user_id: str | None = None
    edu_level: str | None = None          # '专科' | '本科'；透传给 ask_tutor（E8 向后兼容）
    history: list[dict] | None = None     # 多轮历史；透传给 ask_tutor
    authorized: bool = False              # 默认 False（fail-closed）；生产部署须从服务端 JWT/session 提取
    pre_approved: list[str] | None = None # HITL 审批后前端携带的 approval_id 列表


class AgentResponse(BaseModel):
    answer: str
    tool_calls_log: list[dict]
    steps: int
    intent: str               # 'agent' | 'tutor'（用于前端路由标记）
    hitl_pending: bool = False
    approval_id: str | None = None


class ApproveRequest(BaseModel):
    approval_id: str


# ── 路由 ──────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat/tutor", response_model=ChatResponse)
def chat_tutor(req: ChatRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="question不能为空")
    result = ask_tutor(req.question, edu_level=req.edu_level, history=req.history,
                       user_id=req.user_id)
    return ChatResponse(**result)


@app.post("/chat/tutor/stream")
def chat_tutor_stream(req: ChatRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="question不能为空")
    return StreamingResponse(
        ask_tutor_stream(req.question, edu_level=req.edu_level, history=req.history,
                         user_id=req.user_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/chat/agent", response_model=AgentResponse)
def chat_agent(req: AgentRequest):
    """
    意图路由：
    - 含规划/批改/生成等动作词 → ask_agent（FC 循环）
    - 纯问答 → 透传 ask_tutor，包装成 AgentResponse 返回（E8 向后兼容）
    """
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="question不能为空")

    intent = route_intent(req.question)

    if intent == "agent":
        result = ask_agent(req.question, user_id=req.user_id, authorized=req.authorized,
                           pre_approved=set(req.pre_approved) if req.pre_approved else None)
        return AgentResponse(
            intent="agent",
            answer=result.get("answer", ""),
            tool_calls_log=result.get("tool_calls_log", []),
            steps=result.get("steps", 0),
            hitl_pending=result.get("hitl_pending", False),
            approval_id=result.get("approval_id"),
        )
    else:
        tutor_result = ask_tutor(req.question, edu_level=req.edu_level,
                                 history=req.history, user_id=req.user_id)
        return AgentResponse(
            intent="tutor",
            answer=tutor_result["answer"],
            tool_calls_log=[],
            steps=1,
        )


# ── F6：HITL 审批接口 ─────────────────────────────────────────────────────────

def _hitl_auth_dep(x_hitl_key: str = Header(default="")) -> None:
    """HITL 审批接口鉴权（fail-closed）：未配置密钥时拒绝所有请求。"""
    if not HITL_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="HITL 审批接口未启用：请在 .env 中配置 HITL_API_KEY",
        )
    if x_hitl_key != HITL_API_KEY:
        raise HTTPException(status_code=403, detail="HITL 接口需要有效的 X-Hitl-Key 请求头")


@app.get("/agent/pending", dependencies=[Depends(_hitl_auth_dep)])
def agent_pending():
    """列出所有待审批的 sensitive 工具调用（供前端弹窗展示）。"""
    return {"pending": hitl_pending()}


@app.post("/agent/approve", dependencies=[Depends(_hitl_auth_dep)])
def agent_approve(req: ApproveRequest):
    """放行指定审批请求，允许 sensitive 工具继续执行。鉴权由 _hitl_auth_dep 完成。"""
    ok = hitl_approve(req.approval_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"approval_id {req.approval_id!r} 不存在")
    return {"status": "approved", "approval_id": req.approval_id}


# ── D6：用户反馈闭合→错题本 ────────────────────────────────────────────────────

class FeedbackRequest(BaseModel):
    question: str
    bad_answer: str
    reason: str = ""
    fix_hint: str = ""


@app.post("/chat/feedback")
def chat_feedback(req: FeedbackRequest):
    """
    接收前端负反馈，写入 error_book 形成「用户反馈→错题本」闭环。
    error_book 中的坏 case 后续由 get_few_shot_negatives 注入 prompt，防止重犯。
    """
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="question 不能为空")
    if not req.bad_answer.strip():
        raise HTTPException(status_code=400, detail="bad_answer 不能为空")
    from eval.error_book import add_error
    eid = add_error(
        question=req.question,
        bad_answer=req.bad_answer,
        reason=req.reason or "用户负反馈",
        fix_hint=req.fix_hint,
        source="user_feedback",
    )
    return {"status": "recorded", "error_id": eid}
