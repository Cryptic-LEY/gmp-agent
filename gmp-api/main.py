"""
GMP Agent FastAPI 后端
运行方式：cd gmp-api && uvicorn main:app --reload --port 8001
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agents.tutor import ask_tutor, ask_tutor_stream

app = FastAPI(title="GMP Agent API", version="0.1.0")

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


class ChatResponse(BaseModel):
    answer: str
    sources: list[str]
    critic_triggered: bool


# ── 路由 ──────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat/tutor", response_model=ChatResponse)
def chat_tutor(req: ChatRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="question不能为空")
    result = ask_tutor(req.question, edu_level=req.edu_level, history=req.history)
    return ChatResponse(**result)


@app.post("/chat/tutor/stream")
def chat_tutor_stream(req: ChatRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="question不能为空")
    return StreamingResponse(
        ask_tutor_stream(req.question, edu_level=req.edu_level, history=req.history),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
