"""
Tutor Agent：回答学生GMP相关问题。
实现 Critic Pattern：Generator → Critic校验 → 输出。

LangGraph状态机：
  retrieve → generate → critique → (如有误 → revise) → respond
"""
from __future__ import annotations

import json
import re
from typing import Annotated, TypedDict

import httpx
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage

import time

from config import (
    LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, LLM_ENABLE_THINKING,
    HISTORY_TURNS, RAG_FINAL_TOP_N,
    SEMANTIC_CACHE_ENABLED, CTX_COMPRESS_RATIO,
    MEMORY_ENABLED, PROFILE_ASYNC,
    COVE_ENABLED,
)
from logger import log_query
from rag.retriever import retrieve, DocChunk
from rag.compressor import compress_chunk, reorder_for_llm
from agents.router import route_model


# ── LLM调用（OpenAI兼容） ─────────────────────────────────────────────────────
def _llm_chat(messages: list[dict], temperature: float = 0.3, model: str | None = None) -> str:
    body: dict = {"model": model or LLM_MODEL, "messages": messages, "temperature": temperature}
    if LLM_ENABLE_THINKING:
        body["enable_thinking"] = True
    resp = httpx.post(
        f"{LLM_BASE_URL}/chat/completions",
        headers={"Authorization": f"Bearer {LLM_API_KEY}"},
        json=body,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _llm_chat_stream(messages: list[dict], temperature: float = 0.3, model: str | None = None):
    """流式LLM调用，只yield最终回答内容（过滤掉思考过程）。"""
    body: dict = {"model": model or LLM_MODEL, "messages": messages,
                  "temperature": temperature, "stream": True}
    if LLM_ENABLE_THINKING:
        body["enable_thinking"] = True
    with httpx.Client(timeout=120) as client:
        with client.stream(
            "POST",
            f"{LLM_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {LLM_API_KEY}"},
            json=body,
        ) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[6:].strip()
                if payload == "[DONE]":
                    break
                try:
                    data = json.loads(payload)
                    delta = data["choices"][0].get("delta", {})
                    # 只取 content，跳过 reasoning_content（思考过程）
                    chunk = delta.get("content") or ""
                    if chunk:
                        yield chunk
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue


def _build_generate_messages(
    context: str, question: str,
    history: list[dict] | None, edu_level: str | None,
    profile_hint: str = "",
    summary: str = "",
) -> list[dict]:
    """构造 generate 步骤的 LLM 消息列表（供流式和非流式共用）。"""
    edu_hint = ""
    if edu_level == "专科":
        edu_hint = "用简洁易懂的语言回答，避免过多理论推导，结合实际操作场景举例。"
    elif edu_level == "本科":
        edu_hint = "可适当引用ICH指南和法规原文，分析背后的质量管理原理。"

    edu_note      = f"\n{edu_hint}" if edu_hint else ""
    profile_note  = f"\n学生画像：{profile_hint}" if profile_hint else ""
    summary_note  = f"\n近期话题摘要：{summary}" if summary else ""

    system_prompt = (
        f"你是GMP法规检索助手{edu_note}{profile_note}{summary_note}，"
        "根据以下参考资料回答学生问题。\n\n"
        "参考资料中的法规条文格式为：\n"
        "  【法规条文 第X条 | 来源：来源名 | REG-ID】\n"
        "  条文内容\n\n"
        "输出要求：\n"
        "找到相关法规条文时，逐条输出（条之间空一行）：\n"
        "  【条款编号】第X条\n"
        "  【来源】来源名\n"
        "  【原文内容】条文内容\n\n"
        "其中条款编号、来源、原文内容均从参考资料的标注中直接读取，不得改写。\n\n"
        "若参考资料中没有相关法规条文，根据教材知识点或参考文档简短作答即可。\n\n"
        "禁止：\n"
        "- 输出 REG-、KP- 等内部编号\n"
        "- 原文改写、转述或总结\n"
        "- 每条后加评论句\n"
        "- 末尾加'综上所述'等总结\n"
        "- 将【教材知识点】或【参考文档】中提到的'第X条'作为条款原文输出"
    )
    msgs: list[dict] = [{"role": "system", "content": system_prompt}]
    for msg in (history or [])[-HISTORY_TURNS * 2:]:
        msgs.append({"role": "user" if msg.get("role") == "user" else "assistant",
                     "content": msg["content"]})
    msgs.append({"role": "user", "content": f"参考资料：\n{context}\n\n学生问题：{question}"})
    return msgs


# ── State定义 ─────────────────────────────────────────────────────────────────
class TutorState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    edu_level: str | None              # 学生学历层次
    retrieved_docs: list[dict]         # 检索到的上下文片段
    draft_answer: str                  # Generator生成的初稿
    critic_issues: str                 # Critic发现的问题（空字符串=无问题）
    final_answer: str                  # 最终答案
    query_vec: list[float] | None      # 预计算 embedding（缓存复用 / 避免重嵌入）
    step: int                          # 已执行的 revise 步骤数（limits.early_stop 使用）
    user_id: str | None                # 用户 ID（四层记忆启用键）
    profile_hint: str                  # 档案卡一行注入（空字符串=无画像）
    summary: str                       # 近期对话摘要（空字符串=未触发）


# ── 上下文格式化 ───────────────────────────────────────────────────────────────

# 文档类型映射：判断是"法规条文"还是"参考文档（检查指南/缺陷清单）"
_REG_SOURCE_LABELS = {
    'REG-GMP2010':  ('《药品生产质量管理规范》(2010年版)',    True),
    # GMP附录——按具体子前缀细化，必须在通用 REG-APP 之前
    'REG-APP-WJ':   ('GMP附录·无菌药品',        True),
    'REG-APP-SWZ':  ('GMP附录·生物制品',        True),
    'REG-APP-XYZ':  ('GMP附录·血液制品',        True),
    'REG-APP-YLY':  ('GMP附录·原料药',          True),
    'REG-APP-FL':   ('GMP附录·药用辅料',        True),
    'REG-APP-BC':   ('GMP附录·药包材',          True),
    'REG-APP-ZYZ':  ('GMP附录·中药制剂',        True),
    'REG-APP-ZYP':  ('GMP附录·中药饮片',        True),
    'REG-APP-SH':   ('GMP附录·生化药品',        True),
    'REG-APP-CT':   ('GMP附录·临床试验用药品',  True),
    'REG-APP-CS':   ('GMP附录·计算机化系统',    True),
    'REG-APP-QV':   ('GMP附录·确认与验证',      True),
    'REG-APP-QY':   ('GMP附录·取样',            True),
    'REG-APP-YYY':  ('GMP附录·医用氧',          True),
    'REG-APP':      ('GMP附录',                  True),   # 兜底
    'REG-COM':      ('受托生产法规',             True),
    'REG-PWG':      ('制药用水法规',             True),
    'REG-PVG':      ('工艺验证指南',             True),
    'REG-CTG':      ('细胞治疗指南',             True),
    'REG-CTBG':     ('临床生物制品指南',         True),
    'REG-INND':     ('创新药指南',               True),
    'REG-CAGMP':    ('加拿大GMP',                True),
    'REG-WHO':      ('WHO指南',                  True),
    'REG-RISK':     ('GMP检查缺陷清单',          False),
    'REG-PHL':      ('GMP检查指南',              False),
}


def _source_label(reg_id: str) -> tuple[str, bool]:
    """返回 (来源标签, 是否为正式法规条文)。"""
    for prefix, meta in _REG_SOURCE_LABELS.items():
        if reg_id.startswith(prefix):
            return meta
    return ('GMP相关法规', True)


def _article_display_num(article_num: str, reg_id: str) -> str:
    """把 article_num 字段转成可显示的条款号，如 '二十七' → '第二十七条'。"""
    if not article_num or article_num in ('说明',):
        return reg_id
    if article_num.startswith('（') or article_num.startswith('('):
        return article_num
    return f"第{article_num}条"


def _format_context(docs: list[DocChunk]) -> str:
    parts = []
    for d in docs[:RAG_FINAL_TOP_N]:
        if d.doc_type == 'regulation':
            source_name, is_article = _source_label(d.id)
            if is_article:
                display = _article_display_num(d.title, d.id)
                parts.append(f"【法规条文 {display} | 来源：{source_name} | {d.id}】\n{d.content}")
            else:
                # 缺陷清单/检查指南：明确标注类型，让 LLM 知道这不是法规条文
                section = d.title if d.title else ''
                parts.append(f"【参考文档 {section} | 来源：{source_name} | {d.id}】\n{d.content}")
        else:
            parts.append(f"【教材知识点 {d.id}】{d.title}：{d.content or ''}")
    return '\n\n'.join(parts)


# ── 节点函数 ──────────────────────────────────────────────────────────────────
def node_retrieve(state: TutorState) -> dict:
    question = state["messages"][-1].content
    docs = retrieve(question, edu_level=state.get("edu_level"),
                   query_vec=state.get("query_vec"))
    # score 必须序列化，node_generate 的 reorder_for_llm 依赖它（B4）
    return {"retrieved_docs": [
        {"id": d.id, "doc_type": d.doc_type, "title": d.title,
         "content": d.content, "score": d.score}
        for d in docs
    ]}


def node_generate(state: TutorState) -> dict:
    question = state["messages"][-1].content
    # 压缩 + 头尾重组（B3/B4）；score 由 node_retrieve 序列化传入，reorder 依赖它
    raw_docs = [DocChunk(
        d["id"], d["doc_type"], d["title"], d["content"], d.get("score", 0.0)
    ) for d in state["retrieved_docs"]]
    compressed_docs = [
        DocChunk(d.id, d.doc_type, d.title, compress_chunk(d.content, CTX_COMPRESS_RATIO), d.score)
        for d in raw_docs
    ]
    ordered_docs = reorder_for_llm(compressed_docs)
    context = _format_context(ordered_docs)

    llm_messages = _build_generate_messages(
        context, question,
        history=None,  # history already in state["messages"]
        edu_level=state.get("edu_level"),
        profile_hint=state.get("profile_hint", ""),
        summary=state.get("summary", ""),
    )
    # Replace history placeholder: inject state messages (skipping last HumanMessage)
    # _build_generate_messages already adds edu/profile/summary to system prompt;
    # now slot in the LangGraph message history between system and user-question.
    history_msgs = []
    for msg in state["messages"][:-1]:
        role = "user" if isinstance(msg, HumanMessage) else "assistant"
        history_msgs.append({"role": role, "content": msg.content})
    # llm_messages = [system, ..., user_with_context]
    # insert history before the final user message
    final_user = llm_messages[-1]
    llm_messages = llm_messages[:-1] + history_msgs + [final_user]

    draft = _llm_chat(llm_messages, model=route_model("generate"))
    return {"draft_answer": draft}


def _check_hallucinated_articles(draft: str, retrieved_ids: set[str]) -> str:
    """
    P1-5: 确定性条款编号幻觉检测。
    提取答案中的 reg_id 格式引用（REG-xxx-NNN），核查是否在检索结果中出现过。
    返回问题描述字符串，无问题返回空字符串。
    """
    # 匹配 REG-XXX-NNN 格式的条款引用
    cited = set(re.findall(r'REG-[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+', draft))
    if not cited:
        return ""
    hallucinated = cited - retrieved_ids
    if not hallucinated:
        return ""
    return f"答案引用了以下未经检索确认的条款编号，可能为幻觉：{', '.join(sorted(hallucinated))}，请删除或修正这些引用。"


def _cove_verify(draft: str, context: str, llm_fn=None) -> str:
    """
    CoVe 验证链：让模型对草稿中的关键数值/断言逐条自问「参考资料真的说这个吗」。
    - 返回空字符串 → 无矛盾，不触发 revise。
    - 返回非空字符串 → 描述矛盾，触发 revise。
    - llm_fn(prompt: str) -> str 可注入（测试用，绕开 DashScope）。
    - context/draft 为空时直接跳过（不调 LLM）。
    """
    if not draft or not context:
        return ""

    prompt = (
        "你是GMP法规验证专家。\n\n"
        f"参考资料：\n{context[:2000]}\n\n"
        f"待验证回答：\n{draft[:1000]}\n\n"
        "请检查回答中的关键数值声明（如温度、湿度、粒子等级、时限等）是否与参考资料一致。\n"
        "如果全部一致，只回复：VERIFIED\n"
        "如果有矛盾，指出具体矛盾（一句话）。"
    )

    if llm_fn is not None:
        result = llm_fn(prompt)
    else:
        result = _llm_chat(
            [{"role": "user", "content": prompt}],
            temperature=0.1,
            model=route_model("critique"),
        )

    return "" if result.strip().lower().startswith("verified") else result.strip()


def node_critique(state: TutorState) -> dict:
    """Critic节点：LLM内容校验 + 确定性条款编号幻觉检测（P1-5）+ CoVe验证链（D5）。"""
    reg_docs = [d for d in state["retrieved_docs"] if d["doc_type"] == "regulation"]

    # P1-5: 确定性校验——先检查条款编号是否真实存在
    retrieved_ids = {d["id"] for d in state["retrieved_docs"]}
    hallucination_issue = _check_hallucinated_articles(state["draft_answer"], retrieved_ids)
    if hallucination_issue:
        return {"critic_issues": hallucination_issue}

    if not reg_docs:
        return {"critic_issues": ""}

    # LLM内容校验
    reg_context = '\n'.join(f"【{d['id']}】{d['content']}" for d in reg_docs[:5])
    prompt = f"""你是GMP法规审核专家。请核查以下答案是否与给出的法规条文存在矛盾或错误。

法规原文：
{reg_context}

待审核答案：
{state['draft_answer']}

如果答案与法规一致，请只回复：PASS
如果发现错误，请指出具体问题（一句话）。"""

    messages = [{"role": "user", "content": prompt}]
    result = _llm_chat(messages, temperature=0.1, model=route_model("critique"))
    issues = "" if result.strip().upper().startswith("PASS") else result.strip()

    # D5: CoVe 验证链（critic 通过后再做一次声明级核查；受 COVE_ENABLED 控制）
    if COVE_ENABLED and not issues:
        cove_issues = _cove_verify(state["draft_answer"], reg_context)
        if cove_issues:
            issues = f"[CoVe] {cove_issues}"

    return {"critic_issues": issues}


def node_revise(state: TutorState) -> dict:
    """修订节点：根据Critic意见修正答案。"""
    prompt = f"""原答案存在以下问题：{state['critic_issues']}

请修正原答案，确保符合GMP法规要求：
{state['draft_answer']}

只输出修正后的答案，不要解释修改原因。"""

    messages = [{"role": "user", "content": prompt}]
    revised = _llm_chat(messages, model=route_model("revise"))
    return {"final_answer": revised, "step": state.get("step", 0) + 1}


def node_respond(state: TutorState) -> dict:
    return {"final_answer": state["draft_answer"]}


def _should_revise(state: TutorState) -> str:
    from agents.limits import early_stop
    if state.get("critic_issues") and not early_stop(state.get("step", 0)):
        return "revise"
    return "respond"


# ── 构建LangGraph状态机 ────────────────────────────────────────────────────────
def build_tutor_graph():
    g = StateGraph(TutorState)
    g.add_node("retrieve", node_retrieve)
    g.add_node("generate", node_generate)
    g.add_node("critique", node_critique)
    g.add_node("revise",   node_revise)
    g.add_node("respond",  node_respond)

    g.set_entry_point("retrieve")
    g.add_edge("retrieve", "generate")
    g.add_edge("generate", "critique")
    g.add_conditional_edges("critique", _should_revise, {"revise": "revise", "respond": "respond"})
    g.add_edge("revise",  END)
    g.add_edge("respond", END)

    return g.compile()


tutor_graph = build_tutor_graph()


# ── 对外调用入口 ───────────────────────────────────────────────────────────────
def ask_tutor(
    question: str,
    edu_level: str | None = None,
    history: list[dict] | None = None,
    user_id: str | None = None,
) -> dict:
    """
    Args:
      question:  当前学生问题
      edu_level: '专科' | '本科' | None
      history:   最近 N 轮对话 [{role: 'user'|'assistant', content: str}, ...]
      user_id:   用户 ID（有值时启用四层记忆；无则退化为现状）
    Returns:
      {"answer": str, "sources": list[str], "critic_triggered": bool}
    """
    # ── 四层记忆：用户档案卡 + 语义级历史过滤 + 摘要 ─────────────────────────
    profile_hint = ""
    summary = ""
    filtered_history = list(history or [])

    if user_id and MEMORY_ENABLED:
        try:
            from memory.profile import get_profile, get_profile_hint
            from memory.summary import build_window_and_summary
            profile = get_profile(user_id)
            profile_hint = get_profile_hint(profile)
            # 语义过滤 + 摘要（不调 DashScope，mock_llm=None → 生产用）
            filtered_history, summary = build_window_and_summary(
                filtered_history, mock_llm=None
            )
        except Exception:
            pass  # 记忆不可用时静默降级

    # 把前端传来的历史转成 LangChain Message 对象，只取最近 HISTORY_TURNS 轮
    history_messages: list[BaseMessage] = []
    for msg in filtered_history[-HISTORY_TURNS * 2:]:
        if msg.get("role") == "user":
            history_messages.append(HumanMessage(content=msg["content"]))
        else:
            history_messages.append(AIMessage(content=msg["content"]))

    # 预计算 embedding（用于缓存命中检测，失败则降级）
    query_vec: list[float] | None = None
    if SEMANTIC_CACHE_ENABLED:
        from rag.retriever import embed_query
        try:
            query_vec = embed_query(question)
        except Exception:
            pass

    # 语义缓存前置检查（B5）
    if SEMANTIC_CACHE_ENABLED and query_vec:
        from cache.semantic_cache import get_cache
        cached = get_cache().get(query_vec, edu_level)
        if cached:
            return cached

    initial_state: TutorState = {
        "messages": history_messages + [HumanMessage(content=question)],
        "edu_level": edu_level,
        "retrieved_docs": [],
        "draft_answer": "",
        "critic_issues": "",
        "final_answer": "",
        "query_vec": query_vec,
        "step": 0,
        "user_id": user_id,
        "profile_hint": profile_hint,
        "summary": summary,
    }
    t0 = time.monotonic()
    result = tutor_graph.invoke(initial_state)
    latency_ms = int((time.monotonic() - t0) * 1000)

    sources = [d["id"] for d in result["retrieved_docs"]]
    critic_triggered = bool(result.get("critic_issues"))
    answer_result = {
        "answer": result["final_answer"],
        "sources": sources,
        "critic_triggered": critic_triggered,
    }

    # 写入语义缓存
    if SEMANTIC_CACHE_ENABLED and query_vec:
        from cache.semantic_cache import get_cache
        get_cache().put(query_vec, edu_level, answer_result)

    # ── 四层记忆：异步实体抽取 + 命中率监控 ──────────────────────────────────
    if user_id and MEMORY_ENABLED:
        if PROFILE_ASYNC:
            try:
                from memory.profile import extract_entities_async
                extract_entities_async(question, result["final_answer"], user_id)
            except Exception:
                pass
        try:
            from memory.metrics import log_memory_usage
            injected = [profile_hint, summary]
            log_memory_usage(user_id, [e for e in injected if e],
                             result["final_answer"])
        except Exception:
            pass

    log_query(
        question=question,
        edu_level=edu_level,
        retrieved_ids=sources,
        draft_answer=result.get("draft_answer", ""),
        critic_triggered=critic_triggered,
        final_answer=result["final_answer"],
        latency_ms=latency_ms,
    )

    return answer_result


# ── 流式问答入口（P2-3） ────────────────────────────────────────────────────────
def ask_tutor_stream(
    question: str,
    edu_level: str | None = None,
    history: list[dict] | None = None,
    user_id: str | None = None,
):
    """
    流式版本。yield SSE格式字符串：
      data: {"chunk": "文字"}\n\n      — 答案token
      data: {"done": true, "sources": [...], "critic_triggered": bool}\n\n  — 结束

    generate阶段缓冲（critique需要完整草稿），revise阶段真实流式。
    """
    t0 = time.monotonic()

    # ── 四层记忆：档案卡 + 语义过滤 + 摘要 ────────────────────────────────────
    profile_hint = ""
    summary = ""
    filtered_history = list(history or [])
    if user_id and MEMORY_ENABLED:
        try:
            from memory.profile import get_profile, get_profile_hint
            from memory.summary import build_window_and_summary
            profile = get_profile(user_id)
            profile_hint = get_profile_hint(profile)
            filtered_history, summary = build_window_and_summary(
                filtered_history, mock_llm=None
            )
        except Exception:
            pass

    # 语义缓存前置检查（流式：命中时把缓存分块流出）
    query_vec: list[float] | None = None
    if SEMANTIC_CACHE_ENABLED:
        from rag.retriever import embed_query
        from cache.semantic_cache import get_cache
        try:
            query_vec = embed_query(question)
        except Exception:
            pass
        if query_vec:
            cached = get_cache().get(query_vec, edu_level)
            if cached:
                answer = cached.get("answer", "")
                for i in range(0, len(answer), 8):
                    yield f'data: {json.dumps({"chunk": answer[i:i+8]}, ensure_ascii=False)}\n\n'
                yield f'data: {json.dumps({"done": True, "sources": cached.get("sources", []), "critic_triggered": cached.get("critic_triggered", False)}, ensure_ascii=False)}\n\n'
                return

    # 1. retrieve（传入预计算的 query_vec 避免重嵌入）
    docs = retrieve(question, edu_level=edu_level, query_vec=query_vec)
    sources = [d.id for d in docs]

    # 压缩 + 头尾重组（B3/B4）
    compressed_docs = [
        DocChunk(d.id, d.doc_type, d.title, compress_chunk(d.content, CTX_COMPRESS_RATIO), d.score)
        for d in docs
    ]
    ordered_docs = reorder_for_llm(compressed_docs)
    context = _format_context(ordered_docs)

    # 2. generate（缓冲，critique前不能流出）
    gen_messages = _build_generate_messages(
        context, question, filtered_history, edu_level,
        profile_hint=profile_hint, summary=summary,
    )
    draft = ""
    try:
        for chunk in _llm_chat_stream(gen_messages):
            draft += chunk
    except Exception:
        draft = _llm_chat(gen_messages)  # 降级到同步

    # 3. 确定性幻觉检测
    retrieved_ids = {d.id for d in docs}
    critic_issues = _check_hallucinated_articles(draft, retrieved_ids)

    # 4. LLM内容校验（有法规条文时）
    if not critic_issues:
        reg_docs = [d for d in docs if d.doc_type == "regulation"]
        if reg_docs:
            reg_context = "\n".join(f"【{d.id}】{d.content}" for d in reg_docs[:5])
            critique_prompt = (
                f"你是GMP法规审核专家。请核查以下答案是否与给出的法规条文存在矛盾或错误。\n\n"
                f"法规原文：\n{reg_context}\n\n待审核答案：\n{draft}\n\n"
                f"如果答案与法规一致，请只回复：PASS\n如果发现错误，请指出具体问题（一句话）。"
            )
            result = _llm_chat(
                [{"role": "user", "content": critique_prompt}],
                temperature=0.1, model=route_model("critique"),
            )
            if not result.strip().upper().startswith("PASS"):
                critic_issues = result.strip()
            elif COVE_ENABLED:
                # 4b. CoVe 验证链（与非流式路径对称）
                cove_issues = _cove_verify(draft, reg_context)
                if cove_issues:
                    critic_issues = f"[CoVe] {cove_issues}"

    critic_triggered = bool(critic_issues)

    # 5. 流式输出最终答案
    final_answer = ""
    if critic_issues:
        # revise：真实流式（LLM重新生成）
        revise_prompt = (
            f"原答案存在以下问题：{critic_issues}\n\n"
            f"请修正原答案，确保符合GMP法规要求：\n{draft}\n\n"
            f"只输出修正后的答案，不要解释修改原因。"
        )
        try:
            for chunk in _llm_chat_stream(
                [{"role": "user", "content": revise_prompt}],
                model=route_model("revise"),
            ):
                final_answer += chunk
                yield f'data: {json.dumps({"chunk": chunk}, ensure_ascii=False)}\n\n'
        except Exception:
            final_answer = _llm_chat(
                [{"role": "user", "content": revise_prompt}],
                model=route_model("revise"),
            )
            yield f'data: {json.dumps({"chunk": final_answer}, ensure_ascii=False)}\n\n'
    else:
        # respond：分块流出已生成草稿，20ms间隔制造逐字显示效果
        final_answer = draft
        for i in range(0, len(draft), 8):
            yield f'data: {json.dumps({"chunk": draft[i:i+8]}, ensure_ascii=False)}\n\n'
            time.sleep(0.02)

    # 写入缓存（流式版本：回答完整后写入）
    if SEMANTIC_CACHE_ENABLED and query_vec:
        from cache.semantic_cache import get_cache
        get_cache().put(query_vec, edu_level, {
            "answer": final_answer,
            "sources": sources,
            "critic_triggered": critic_triggered,
        })

    # 6. done信号
    latency_ms = int((time.monotonic() - t0) * 1000)
    yield (
        f'data: {json.dumps({"done": True, "sources": sources, "critic_triggered": critic_triggered}, ensure_ascii=False)}\n\n'
    )

    # 7. 四层记忆：异步实体抽取 + 命中率监控
    if user_id and MEMORY_ENABLED:
        if PROFILE_ASYNC:
            try:
                from memory.profile import extract_entities_async
                extract_entities_async(question, final_answer, user_id)
            except Exception:
                pass
        try:
            from memory.metrics import log_memory_usage
            log_memory_usage(user_id, [e for e in [profile_hint, summary] if e],
                             final_answer)
        except Exception:
            pass

    # 8. 写日志
    log_query(
        question=question,
        edu_level=edu_level,
        retrieved_ids=sources,
        draft_answer=draft,
        critic_triggered=critic_triggered,
        final_answer=final_answer,
        latency_ms=latency_ms,
    )
