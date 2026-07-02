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
        # 预热检索链路：首次 FULLTEXT/建连是冷路径(~760ms)，在此消化，
        # 避免第一个真实用户请求承担冷启动延迟（A3 稳态 P95≈30ms）。
        try:
            from rag.retriever import retrieve
            from config import EMB_DIM
            retrieve("洁净区预热查询", query_vec=[0.1] * EMB_DIM,
                     rerank_fn=lambda q, ps: [1.0] * len(ps))
            print("[startup] 检索链路预热完成")
        except Exception as we:  # noqa: BLE001
            print(f"[startup] 检索预热跳过：{we}")
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
    # B6 闭环：清除该坏答案的语义缓存条目，避免继续从缓存下发
    from config import SEMANTIC_CACHE_ENABLED
    cleared = 0
    if SEMANTIC_CACHE_ENABLED:
        from cache.semantic_cache import get_cache
        cleared = get_cache().invalidate_by_answer(req.bad_answer)
    return {"status": "recorded", "error_id": eid, "cache_cleared": cleared}


# ── C6：好 case 经验回流（Critic 通过 + 用户正反馈 双门槛）──────────────────────

class PositiveFeedbackRequest(BaseModel):
    question: str
    answer: str
    edu_level: str | None = None
    # 注意：不接受客户端 critic_triggered/sources——Critic 结果由服务端重新核验，
    # 客户端自述不可信（否则「双门槛」可被伪造）。


@app.post("/chat/feedback/positive")
def chat_feedback_positive(req: PositiveFeedbackRequest):
    """
    接收前端正反馈（用户点赞）。双门槛 = 「服务端 Critic 复核通过」+「用户显式点赞」。

    关键：Critic 那一半由**服务端自己核验**，不信客户端透传的 critic_triggered。
    服务端按问题重新检索得到可信 reg_id 集合，跑确定性条款幻觉检测——答案若引用了
    检索里不存在的条款号（最危险的伪造/幻觉）则拒绝回流，防止坏答案污染经验池。
    """
    if not req.question.strip() or not req.answer.strip():
        raise HTTPException(status_code=400, detail="question 和 answer 不能为空")

    # 服务端复核 Critic（不可被客户端绕过）：两道关
    from rag.retriever import retrieve
    from agents.tutor import _check_hallucinated_articles, _cove_verify
    from config import COVE_ENABLED
    try:
        retrieved = retrieve(req.question, edu_level=req.edu_level)
        valid_ids = {c.id for c in retrieved}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"检索不可用，暂无法核验：{e}")

    # 关1（确定性、零成本）：引用了检索里没有的条款号 → 幻觉，拒
    issue = _check_hallucinated_articles(req.answer, valid_ids)
    if issue:
        return {"status": "rejected", "reason": f"服务端 Critic（条款幻觉）未通过：{issue}"}

    # 关2（CoVe 忠实度）：逐条比对答案关键声明与检索上下文，抓「不引用条款号的语义错误」。
    # 覆盖「答案内容与法规矛盾但没伪造 REG-ID」的情形。
    if COVE_ENABLED:
        context = "\n".join(c.content for c in retrieved[:8])
        contradiction = _cove_verify(req.answer, context)
        if contradiction:
            return {"status": "rejected",
                    "reason": f"服务端 Critic（忠实度）未通过：{contradiction}"}

    import uuid
    from memory.experience import add_experience
    exp_id = uuid.uuid4().hex[:12]
    indexed, persisted = add_experience(exp_id, req.question, req.answer, list(valid_ids)[:8])
    if not indexed:
        return {"status": "skipped", "exp_id": None}
    if not persisted:
        # 索引已生效但写库失败：如实上报，不谎称 durable 回流
        return {"status": "reflowed_volatile", "exp_id": exp_id,
                "warning": "已加入内存索引但持久化失败，重启后会丢失"}
    return {"status": "reflowed", "exp_id": exp_id}
