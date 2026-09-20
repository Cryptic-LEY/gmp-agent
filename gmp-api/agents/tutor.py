"""
Tutor Agent：回答学生GMP相关问题。
实现 Critic Pattern：Generator → Critic校验 → 输出。

LangGraph状态机：
  retrieve → generate → critique → (如有误 → revise) → respond
"""
from __future__ import annotations

import difflib
import hashlib
import json
import re
import unicodedata
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
    TUTOR_REPAIR_V2_ENABLED, TUTOR_REPAIR_MAX_REVISIONS,
    TUTOR_REPAIR_MIN_CONFIDENCE, TUTOR_REPAIR_MAX_REPEAT_ISSUES,
)
from logger import log_query
from rag.retriever import capture_retrieval_timings, retrieve, DocChunk
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
    negatives_hint: str = "",
    current_state_hint: str = "",
) -> list[dict]:
    """构造 generate 步骤的 LLM 消息列表（供流式和非流式共用）。"""
    from memory.context_observer import ContextObserver
    obs = ContextObserver()
    obs.record("profile_hint", profile_hint)
    obs.record("summary", summary)
    obs.record("current_state", current_state_hint)
    obs.record("negatives_hint", negatives_hint)
    obs.check()   # 超出预算时打 WARNING，不截断

    edu_hint = ""
    if edu_level == "专科":
        edu_hint = "用简洁易懂的语言回答，避免过多理论推导，结合实际操作场景举例。"
    elif edu_level == "本科":
        edu_hint = "可适当引用ICH指南和法规原文，分析背后的质量管理原理。"

    edu_note       = f"\n{edu_hint}" if edu_hint else ""
    profile_note   = f"\n学生画像：{profile_hint}" if profile_hint else ""
    summary_note   = f"\n近期话题摘要：{summary}" if summary else ""
    negatives_note = f"\n{negatives_hint}" if negatives_hint else ""
    cs_note        = f"\n{current_state_hint}" if current_state_hint else ""

    system_prompt = (
        f"你是GMP法规检索助手{edu_note}{profile_note}{summary_note}{cs_note}{negatives_note}，"
        "根据以下参考资料回答学生问题。\n\n"
        "参考资料中的法规条文格式为：\n"
        "  【法规条文 第X条 | 来源：来源名 | REG-ID】\n"
        "  条文内容\n\n"
        + _answer_output_contract()
    )
    msgs: list[dict] = [{"role": "system", "content": system_prompt}]
    for msg in (history or [])[-HISTORY_TURNS * 2:]:
        msgs.append({"role": "user" if msg.get("role") == "user" else "assistant",
                     "content": msg["content"]})
    msgs.append({"role": "user", "content": f"参考资料：\n{context}\n\n学生问题：{question}"})
    return msgs


# ── 05 V2：统一证据契约与共享输出约束（默认关，V1 行为不变）─────────────────
class TutorEvidence(TypedDict):
    context: str
    context_sha256: str
    retrieved_ids: list[str]
    items: list[dict]


def _sha256_text(s: str) -> str:
    return hashlib.sha256((s or "").encode("utf-8")).hexdigest()


def _answer_output_contract() -> str:
    """Generate 与 V2 Revise 共用的输出约束（抽出防两套 prompt 漂移）。"""
    return (
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


def _prepare_tutor_evidence(retrieved_docs: list[dict]) -> TutorEvidence:
    """构造 Generate/Critic/Revise 共享的证据上下文（与 node_generate 完全相同的
    压缩+重排+_format_context 逻辑）+ 证据哈希。retrieved_ids 含全部检索 ID。"""
    raw_docs = [DocChunk(d["id"], d["doc_type"], d["title"], d["content"], d.get("score", 0.0))
                for d in retrieved_docs]
    compressed = [DocChunk(d.id, d.doc_type, d.title,
                           compress_chunk(d.content, CTX_COMPRESS_RATIO), d.score)
                  for d in raw_docs]
    ordered = reorder_for_llm(compressed)
    provided_docs = ordered[:RAG_FINAL_TOP_N]
    context = _format_context(provided_docs)
    orig_by_id = {d.id: d.content for d in raw_docs}
    items = []
    for d in provided_docs:
        display_article = ""
        display_source = ""
        is_citable = False
        if d.doc_type == "regulation":
            display_source, is_citable = _source_label(d.id)
            if is_citable:
                display_article = _article_display_num(d.title, d.id)
        original_content = orig_by_id.get(d.id, d.content)
        provided_sha = _sha256_text(d.content or "")
        original_sha = _sha256_text(original_content or "")
        items.append({
            "id": d.id, "doc_type": d.doc_type, "title": d.title, "score": d.score,
            "display_article": display_article,
            "display_source": display_source,
            "is_citable": is_citable,
            "provided_content": d.content,
            "original_content": original_content,
            "provided_content_sha256": provided_sha,
            "original_content_sha256": original_sha,
            # Backward-compatible aliases for frozen V2 harness consumers.
            "provided_sha256": provided_sha,
            "original_sha256": original_sha,
        })
    return {
        "context": context,
        "context_sha256": _sha256_text(context),
        "retrieved_ids": [d.id for d in raw_docs],
        "provided_ids": [d.id for d in provided_docs],
        "items": items,
    }


def _norm_for_quote(s: str) -> str:
    return unicodedata.normalize("NFC", (s or "")).replace(" ", "").replace("\n", "").strip()


def _is_verbatim_excerpt(quote: str, evidence: TutorEvidence) -> bool:
    """quote 是否为某条证据的连续逐字片段（空白规范化后子串）；部分摘录也算。
    只比对模型实际看到的 provided_content；压缩掉的原文尾部不构成当前证据。"""
    q = _norm_for_quote(quote)
    if not q:
        return False
    for it in evidence["items"]:
        if q in _norm_for_quote(it.get("provided_content", "")):
            return True
    return False


def _critic_evidence_context(state: "TutorState") -> tuple[str, set[str]]:
    """Critic 应使用的 (证据上下文, 检索ID集)。
    V2（开关开且已有 evidence）：用与 Generate 相同的完整证据；否则退回 legacy 前 5 条法规。"""
    if TUTOR_REPAIR_V2_ENABLED and state.get("evidence"):
        ev = state["evidence"]
        return ev["context"], set(ev["retrieved_ids"])
    reg_docs = [d for d in state["retrieved_docs"] if d["doc_type"] == "regulation"]
    retrieved_ids = {d["id"] for d in state["retrieved_docs"]}
    reg_context = "\n".join(f"【{d['id']}】{d['content']}" for d in reg_docs[:5])
    return reg_context, retrieved_ids


# ── 05 V2：确定性契约 + 结构化 Critic ────────────────────────────────────────
class CriticIssue(TypedDict):
    issue_id: str
    issue_type: str
    severity: str
    claim: str
    target_text: str
    evidence_ids: list[str]
    evidence_quote: str
    correction: str
    confidence: float
    auto_repairable: bool
    validation_errors: list[str]


class CriticDecision(TypedDict):
    passed: bool
    issues: list[CriticIssue]
    raw_response: str
    context_sha256: str
    decision_source: str


_ALLOWED_ISSUE_TYPES = frozenset({
    "internal_id_leak", "citation_format", "unsupported_citation", "quote_mismatch",
    "source_mismatch", "fact_contradiction", "answer_incomplete",
    "authority_conflict", "critic_parse_error",
})
_ALLOWED_SEVERITIES = frozenset({"high", "medium", "low"})
# 确定性问题：始终可自动修订（无需 LLM 证据）。
_DETERMINISTIC_ISSUE_TYPES = frozenset({
    "internal_id_leak", "citation_format", "quote_mismatch",
    "unsupported_citation", "source_mismatch",
})
# 绝不自动修订：交人工/知识库审核。
_NON_AUTO_ISSUE_TYPES = frozenset({
    "authority_conflict", "answer_incomplete", "critic_parse_error",
})
# 这两类补丁会改写引用块中的字段，只允许确定性解析器授予修订权限。
_DETERMINISTIC_FIELD_ISSUE_TYPES = frozenset({"source_mismatch", "quote_mismatch"})

_V2_INTERNAL_ID_RE = re.compile(r"(?:REG|KP)-[A-Z0-9][A-Z0-9\-]*")
_V2_CITE_RE = re.compile(
    r"【条款编号】\s*(?P<article>.*?)\s*【来源】\s*(?P<source>.*?)\s*"
    r"【原文内容】\s*(?P<content>.*?)(?=【条款编号】|\Z)", re.S,
)


def _sanitize_internal_ids(draft: str) -> tuple[str, list[dict]]:
    """Remove internal REG/KP identifiers without changing unrelated text.

    Each returned edit uses coordinates from the original draft, so applying
    the edits from right to left reconstructs the sanitized draft exactly.
    Horizontal whitespace is consumed only when it directly surrounds a
    removed identifier and would otherwise leave a duplicate or dangling gap.
    """
    original = draft or ""
    edits: list[dict] = []
    for match in _V2_INTERNAL_ID_RE.finditer(original):
        start, end = match.span()
        left_space = start > 0 and original[start - 1] in " \t"
        right_space = end < len(original) and original[end] in " \t"
        replacement = ""
        if left_space and right_space:
            start -= 1
            end += 1
            replacement = " "
        elif left_space:
            start -= 1
        before = original[start:end]
        edits.append({
            "kind": "internal_id_remove",
            "start": start,
            "end": end,
            "before": before,
            "after": replacement,
            "before_sha256": _sha256_text(before),
            "after_sha256": _sha256_text(replacement),
        })

    sanitized = original
    for edit in reversed(edits):
        sanitized = (sanitized[:edit["start"]] + edit["after"]
                     + sanitized[edit["end"]:])
    return sanitized, edits


def _mk_issue(issue_type: str, severity: str = "high", *, claim: str = "",
              target_text: str = "",
              evidence_ids: list[str] | None = None, evidence_quote: str = "",
              correction: str = "", confidence: float = 1.0, issue_id: str = "") -> CriticIssue:
    return {"issue_id": issue_id or issue_type, "issue_type": issue_type, "severity": severity,
            "claim": claim, "target_text": target_text,
            "evidence_ids": evidence_ids or [], "evidence_quote": evidence_quote,
            "correction": correction, "confidence": confidence}


def _parse_citation_blocks_v2(answer: str) -> list[dict]:
    return [{"article": m.group("article").strip(), "source": m.group("source").strip(),
             "content": m.group("content").strip(), "target_text": m.group(0).strip(),
             "start": m.start(), "end": m.end()}
            for m in _V2_CITE_RE.finditer(answer or "")]


def _check_output_contract(draft: str, evidence: TutorEvidence) -> list[CriticIssue]:
    """确定性检查（不调 LLM，§5.2）：内部 ID 泄漏 / 引用三字段完整 / 原文必须逐字片段。"""
    issues: list[CriticIssue] = []
    leaks = _V2_INTERNAL_ID_RE.findall(draft or "")
    if leaks:
        issues.append(_mk_issue("internal_id_leak", "high",
                                claim=f"答案出现内部编号：{', '.join(sorted(set(leaks)))}",
                                correction="删除全部 REG-/KP- 内部编号"))
    citable = [item for item in evidence["items"] if item.get("is_citable")]
    blocks = _parse_citation_blocks_v2(draft)
    marker_counts = [
        (draft or "").count("【条款编号】"),
        (draft or "").count("【来源】"),
        (draft or "").count("【原文内容】"),
    ]
    marker_blocks = max(marker_counts, default=0)
    if marker_blocks and (len(set(marker_counts)) != 1 or len(blocks) != marker_blocks):
        issues.append(_mk_issue(
            "citation_format", "high", target_text=draft or "",
            claim="引用块缺少字段、字段顺序错误或存在无法解析的额外标记",
            correction="删除不完整引用，或补全条款编号/来源/原文内容三字段",
        ))
    for b in blocks:
        if not (b["article"] and b["source"] and b["content"]):
            issues.append(_mk_issue("citation_format", "high",
                                    claim=f"引用块字段不完整：{b}", correction="补全条款编号/来源/原文内容三字段"))
            continue
        article_matches = [
            item for item in citable
            if _norm_for_quote(item.get("display_article", "")) == _norm_for_quote(b["article"])
        ]
        if not article_matches:
            issues.append(_mk_issue(
                "unsupported_citation", "high",
                claim=f"条款编号没有对应的已提供法规证据：{b['article']}",
                correction="删除该引用或改为已提供证据中的条款编号",
            ))
            continue
        source_matches = [
            item for item in article_matches
            if _norm_for_quote(item.get("display_source", "")) == _norm_for_quote(b["source"])
        ]
        if not source_matches:
            uniquely_identified = len(article_matches) == 1
            matched = article_matches[0] if uniquely_identified else None
            issues.append(_mk_issue(
                "source_mismatch", "high",
                claim=f"来源与条款证据不匹配：{b['source']}",
                target_text=b["source"] if uniquely_identified else "",
                evidence_ids=[item["id"] for item in article_matches],
                evidence_quote=(matched.get("provided_content", "") if matched else ""),
                correction=(matched.get("display_source", "") if matched else ""),
            ))
            continue
        quote_matches = [
            item for item in source_matches
            if _norm_for_quote(b["content"]) in _norm_for_quote(item.get("provided_content", ""))
        ]
        if not quote_matches:
            uniquely_identified = len(source_matches) == 1
            matched = source_matches[0] if uniquely_identified else None
            issues.append(_mk_issue("quote_mismatch", "high",
                                    claim=f"原文内容非证据逐字片段：{b['content'][:40]}",
                                    target_text=b["content"] if uniquely_identified else "",
                                    evidence_ids=[item["id"] for item in source_matches],
                                    evidence_quote=(matched.get("provided_content", "") if matched else ""),
                                    correction=(matched.get("provided_content", "") if matched else "")))
            continue
        if len({item["id"] for item in quote_matches}) != 1:
            issues.append(_mk_issue(
                "unsupported_citation", "high",
                claim="引用三元组不能唯一映射到一个已提供证据项",
                evidence_ids=[item["id"] for item in quote_matches],
                evidence_quote=b["content"],
                correction="使用能唯一映射到单条证据的引用",
            ))
    return issues


def _build_critic_v2_prompt(question: str, draft: str, evidence: TutorEvidence) -> str:
    return (
        "你是GMP法规审核专家。仅依据【提供的证据】审核【待审答案】是否与证据矛盾或缺乏依据。\n"
        "权威规则：法规条文是法规断言的第一证据；教材知识点只作解释、不得当法规原文；历史经验不得作引用依据。\n"
        "不得仅凭你自己的知识声称某个已提供条款“不存在”。若证据与你已知知识冲突，用 issue_type=authority_conflict。\n"
        "“答案没有覆盖所有证据”本身不是错误；只有问题明确要求且确实漏答，才用 answer_incomplete。\n\n"
        f"问题：{question}\n\n提供的证据：\n{evidence['context']}\n\n待审答案：\n{draft}\n\n"
        "只输出 JSON（不要多余文字）：\n"
        '{"passed": true 或 false, "issues": [{"issue_id":"I1","issue_type":"<允许类型>",'
        '"severity":"high|medium|low","claim":"待核查声明",'
        '"target_text":"答案中逐字存在且唯一的目标文本","evidence_ids":["REG-..."],'
        '"evidence_quote":"支持判断的证据原句","correction":"最小修正目标","confidence":0.0到1.0}]}\n'
        "允许的 issue_type：internal_id_leak, citation_format, unsupported_citation, quote_mismatch, "
        "source_mismatch, fact_contradiction, answer_incomplete, authority_conflict。\n"
        "passed=true 时 issues 必须为空数组。"
    )


def _extract_json_obj(text: str) -> dict | None:
    if not text:
        return None
    m = re.search(r"\{.*\}", text.strip(), re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
        return obj if isinstance(obj, dict) else None
    except Exception:  # noqa: BLE001
        return None


def _parse_critic_v2(raw: str, evidence: TutorEvidence) -> CriticDecision:
    """严格解析结构化 Critic JSON；任何不合规 → critic_parse_error，fail-closed，不追加 LLM 调用。"""
    ctx_sha = evidence["context_sha256"]

    def err(msg: str) -> CriticDecision:
        return {"passed": False, "issues": [_mk_issue("critic_parse_error", "high", claim=msg)],
                "raw_response": raw, "context_sha256": ctx_sha, "decision_source": "parse_error"}

    obj = _extract_json_obj(raw)
    if obj is None or "passed" not in obj:
        return err("无法解析 JSON 或缺少 passed 字段")
    passed, issues_raw = obj.get("passed"), obj.get("issues", [])
    if not isinstance(passed, bool) or not isinstance(issues_raw, list):
        return err("passed/issues 类型错误")
    if passed and issues_raw:
        return err("passed=true 但 issues 非空")
    if not passed and not issues_raw:
        return err("passed=false 但 issues 为空")
    issues: list[CriticIssue] = []
    for it in issues_raw:
        if not isinstance(it, dict):
            return err("issue 非对象")
        t = it.get("issue_type")
        if t not in _ALLOWED_ISSUE_TYPES:
            return err(f"非法 issue_type：{t}")
        try:
            issues.append(_mk_issue(
                t, str(it.get("severity", "medium")), claim=str(it.get("claim", "")),
                target_text=str(it.get("target_text", "")),
                evidence_ids=list(it.get("evidence_ids") or []),
                evidence_quote=str(it.get("evidence_quote", "")),
                correction=str(it.get("correction", "")),
                confidence=float(it.get("confidence", 0.0)),
                issue_id=str(it.get("issue_id", "")),
            ))
        except (TypeError, ValueError):
            return err("issue 字段类型错误")
    return {"passed": passed, "issues": issues, "raw_response": raw,
            "context_sha256": ctx_sha, "decision_source": "llm"}


def _validate_critic_decision(decision: CriticDecision, draft: str,
                              evidence: TutorEvidence) -> CriticDecision:
    """Annotate issues with validation failures and explicit repair authority."""
    provided = {item["id"]: item for item in evidence.get("items", [])}
    validated: list[CriticIssue] = []
    for raw_issue in decision.get("issues", []):
        issue = dict(raw_issue)
        errors: list[str] = []
        issue_type = issue.get("issue_type")
        severity = issue.get("severity")
        target = str(issue.get("target_text", ""))
        evidence_ids = issue.get("evidence_ids") or []
        quote = str(issue.get("evidence_quote", ""))
        correction = str(issue.get("correction", ""))
        try:
            confidence = float(issue.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = -1.0

        if issue_type not in _ALLOWED_ISSUE_TYPES:
            errors.append("invalid_issue_type")
        if severity not in _ALLOWED_SEVERITIES:
            errors.append("invalid_severity")
        if not 0.0 <= confidence <= 1.0:
            errors.append("invalid_confidence")
        elif confidence < TUTOR_REPAIR_MIN_CONFIDENCE:
            errors.append("confidence_below_threshold")
        if not target or (draft or "").count(target) != 1:
            errors.append("target_not_unique")
        if (not isinstance(evidence_ids, list) or not evidence_ids
                or any(not isinstance(item_id, str) or item_id not in provided
                       for item_id in evidence_ids)):
            errors.append("unknown_evidence_id")
        if not quote or not any(
            _norm_for_quote(quote) in _norm_for_quote(provided[item_id].get("provided_content", ""))
            for item_id in evidence_ids if isinstance(item_id, str) and item_id in provided
        ):
            errors.append("evidence_quote_mismatch")
        if not correction or _V2_INTERNAL_ID_RE.search(correction):
            errors.append("invalid_correction")
        if (issue_type in _DETERMINISTIC_FIELD_ISSUE_TYPES
                and decision.get("decision_source") != "deterministic"):
            errors.append("deterministic_only_issue_type")
        if issue_type in _NON_AUTO_ISSUE_TYPES:
            errors.append("observe_only_issue_type")

        issue["confidence"] = confidence
        issue["target_text"] = target
        issue["evidence_ids"] = list(evidence_ids) if isinstance(evidence_ids, list) else []
        issue["evidence_quote"] = quote
        issue["correction"] = correction
        issue["validation_errors"] = list(dict.fromkeys(errors))
        issue["auto_repairable"] = not issue["validation_errors"]
        validated.append(issue)
    out = dict(decision)
    out["issues"] = validated
    out["passed"] = bool(decision.get("passed")) and not validated
    return out


def _auto_repairable_issues(decision: CriticDecision) -> list[CriticIssue]:
    """可自动修订的问题：确定性问题始终可修；LLM 问题需证据 + 置信度且非权威冲突。"""
    out: list[CriticIssue] = []
    for i in decision["issues"]:
        if "auto_repairable" in i:
            if i["auto_repairable"]:
                out.append(i)
            continue
        t = i["issue_type"]
        if t in _NON_AUTO_ISSUE_TYPES:
            continue
        if t in _DETERMINISTIC_ISSUE_TYPES:
            out.append(i)
            continue
        if (i.get("evidence_ids") and i.get("evidence_quote")
                and float(i.get("confidence", 0.0)) >= TUTOR_REPAIR_MIN_CONFIDENCE):
            out.append(i)
    return out


def _render_critic_issues(decision: CriticDecision) -> str:
    """结构化问题渲染回兼容字段 critic_issues（供旧 API/日志/V1 路径）。"""
    if decision["passed"]:
        return ""
    return "; ".join(f"[{i['issue_type']}] {i['correction'] or i['claim']}".strip()
                     for i in decision["issues"])


def _merge_critic_issues(*groups: list[CriticIssue]) -> list[CriticIssue]:
    """合并同类型、同目标、同证据的问题；确定性组先传入时保留其可复现描述。"""
    merged: list[CriticIssue] = []
    seen: set[tuple] = set()
    for issue in (item for group in groups for item in group):
        key = (
            issue.get("issue_type"),
            _norm_for_quote(str(issue.get("target_text", ""))),
            tuple(sorted(str(item_id) for item_id in (issue.get("evidence_ids") or []))),
        )
        if key in seen:
            continue
        seen.add(key)
        merged.append(issue)
    return merged


def _critique_answer_v2(question: str, draft: str, evidence: TutorEvidence) -> CriticDecision:
    """结构化 Critic：确定性契约 → LLM 结构化审核 → （通过且开启时）CoVe。单次 LLM，不隐藏重试。"""
    ctx_sha = evidence["context_sha256"]
    det = _check_output_contract(draft, evidence)
    raw = _llm_chat([{"role": "user", "content": _build_critic_v2_prompt(question, draft, evidence)}],
                    temperature=0.1, model=route_model("critique"))
    semantic = _validate_critic_decision(_parse_critic_v2(raw, evidence), draft, evidence)
    deterministic = _validate_critic_decision(
        {"passed": not det, "issues": det, "raw_response": "",
         "context_sha256": ctx_sha, "decision_source": "deterministic"},
        draft, evidence,
    )
    merged_issues = _merge_critic_issues(deterministic["issues"], semantic["issues"])
    decision = {
        "passed": not merged_issues,
        "issues": merged_issues,
        "raw_response": raw,
        "context_sha256": ctx_sha,
        "decision_source": ("deterministic+" if det else "") + semantic["decision_source"],
    }
    if decision["passed"] and COVE_ENABLED:
        cove_audit: dict = {}
        cove = _cove_verify(draft, evidence["context"], audit=cove_audit)
        decision["cove_trace"] = cove_audit
        if cove:
            return {"passed": False,
                    "issues": [_mk_issue("fact_contradiction", "medium", claim=cove,
                                         correction="核对并修正数值声明", confidence=0.8, issue_id="COVE")],
                    "raw_response": decision["raw_response"], "context_sha256": ctx_sha,
                    "decision_source": "cove", "cove_trace": cove_audit}
    return decision


# ── 05 V2：有证据的最小 Revise ───────────────────────────────────────────────
def _build_revise_messages_v2(question: str, draft: str, decision: CriticDecision,
                              evidence: TutorEvidence) -> list[dict]:
    """V3 revise message: request only evidence-bound local replacements."""
    repairable = _auto_repairable_issues(decision)
    issues_json = json.dumps(
        [{k: i[k] for k in ("issue_id", "issue_type", "severity", "target_text",
                             "evidence_ids", "evidence_quote", "correction")}
         for i in repairable], ensure_ascii=False)
    prompt = (
        "你是GMP法规答案局部修订助手。只针对下列已验证问题提出逐字替换 patch。\n\n"
        f"原始问题：{question}\n\n"
        f"参考证据：\n{evidence['context']}\n\n"
        f"当前答案：\n{draft}\n\n"
        f"需要修正的问题（JSON）：\n{issues_json}\n\n"
        "只输出严格 JSON，不要 Markdown 或说明：\n"
        '{"edits":[{"issue_id":"I1","operation":"replace",'
        '"target_text":"与 issue 完全相同的唯一原文",'
        '"replacement_text":"仅解决该 issue 的替换文本",'
        '"evidence_ids":["REG-..."]}]}\n'
        "规则：只允许 operation=replace；不得输出完整答案；不得修改 issue 之外的内容；"
        "source_mismatch 的 replacement_text 必须逐字等于证据标注来源；"
        "其他问题必须逐字等于该 issue 的 evidence_quote；"
        "不得补充证据外法规、条款、数值或 REG-/KP- 内部编号；"
        "无法安全局部替换时返回 {\"edits\":[]}。"
    )
    return [{"role": "user", "content": prompt}]


_PATCH_EDIT_KEYS = frozenset({
    "issue_id", "operation", "target_text", "replacement_text", "evidence_ids",
})


def _parse_revise_patch(raw: str) -> list[dict]:
    try:
        obj = json.loads((raw or "").strip())
    except (json.JSONDecodeError, TypeError) as exc:
        raise ValueError("patch_schema: response is not strict JSON") from exc
    if not isinstance(obj, dict) or set(obj) != {"edits"} or not isinstance(obj["edits"], list):
        raise ValueError("patch_schema: expected exactly {'edits': [...]} ")
    parsed: list[dict] = []
    for edit in obj["edits"]:
        if not isinstance(edit, dict) or set(edit) != _PATCH_EDIT_KEYS:
            raise ValueError("patch_schema: invalid edit fields")
        if edit.get("operation") != "replace":
            raise ValueError("patch_schema: only replace is allowed")
        if not all(isinstance(edit.get(key), str)
                   for key in ("issue_id", "target_text", "replacement_text")):
            raise ValueError("patch_schema: edit text fields must be strings")
        if (not isinstance(edit.get("evidence_ids"), list)
                or any(not isinstance(item, str) for item in edit["evidence_ids"])):
            raise ValueError("patch_schema: evidence_ids must be a string list")
        parsed.append(dict(edit))
    return parsed


def _apply_verified_patch(draft: str, edits: list[dict], issues: list[CriticIssue],
                          evidence: TutorEvidence) -> tuple[str, list[dict]]:
    provided = {item["id"]: item for item in evidence.get("items", [])}
    issue_by_id: dict[str, CriticIssue] = {}
    for issue in issues:
        issue_id = issue.get("issue_id", "")
        if not issue_id or issue_id in issue_by_id:
            raise ValueError("issue_id_not_unique")
        issue_by_id[issue_id] = issue

    ranges: list[tuple[int, int]] = []
    trace: list[dict] = []
    used_issue_ids: set[str] = set()
    for edit in edits:
        issue_id = edit["issue_id"]
        issue = issue_by_id.get(issue_id)
        if issue is None or not issue.get("auto_repairable") or issue_id in used_issue_ids:
            raise ValueError("issue_not_repairable")
        used_issue_ids.add(issue_id)
        target = edit["target_text"]
        if target != issue.get("target_text"):
            raise ValueError("target_mismatch")
        if not target or (draft or "").count(target) != 1:
            raise ValueError("target_not_unique")
        replacement = edit["replacement_text"]
        if not replacement:
            raise ValueError("replacement_empty")
        if _V2_INTERNAL_ID_RE.search(replacement):
            raise ValueError("replacement_internal_id")
        edit_evidence_ids = edit["evidence_ids"]
        if (not edit_evidence_ids
                or not set(edit_evidence_ids).issubset(set(issue.get("evidence_ids") or []))):
            raise ValueError("evidence_ids_mismatch")
        replacement_norm = _norm_for_quote(replacement)
        issue_type = issue.get("issue_type")
        if issue_type == "source_mismatch":
            expected_norms = {
                _norm_for_quote(str(provided[item_id].get("display_source", "")))
                for item_id in edit_evidence_ids if item_id in provided
            }
        else:
            quote_norm = _norm_for_quote(str(issue.get("evidence_quote", "")))
            expected_norms = {quote_norm} if quote_norm else set()
            if issue_type == "fact_contradiction":
                target_norm = _norm_for_quote(target)
                if (len(quote_norm) < 4
                        or difflib.SequenceMatcher(None, target_norm, quote_norm).ratio() < 0.5):
                    raise ValueError("replacement_not_expected")
        if replacement_norm not in expected_norms:
            raise ValueError("replacement_not_expected")
        replacement_grounded = any(
            replacement_norm
            and any(
                replacement_norm in _norm_for_quote(str(item.get(field, "")))
                for field in ("provided_content", "display_source", "display_article")
            )
            for item_id in edit_evidence_ids
            for item in [provided.get(item_id, {})]
            if item
        )
        if not replacement_grounded:
            raise ValueError("replacement_not_grounded")
        start = draft.index(target)
        end = start + len(target)
        ranges.append((start, end))
        trace.append({
            "kind": "verified_replace",
            "issue_id": issue_id,
            "evidence_ids": list(edit_evidence_ids),
            "start": start,
            "end": end,
            "before": target,
            "after": replacement,
            "before_sha256": _sha256_text(target),
            "after_sha256": _sha256_text(replacement),
            "protected_region_match": True,
        })

    ordered_ranges = sorted(ranges)
    if any(left[1] > right[0] for left, right in zip(ordered_ranges, ordered_ranges[1:])):
        raise ValueError("overlapping_edits")

    candidate = draft
    for item in sorted(trace, key=lambda row: row["start"], reverse=True):
        candidate = candidate[:item["start"]] + item["after"] + candidate[item["end"]:]
    return candidate, trace


# ── 05 V2：收敛/退化/最佳候选护栏（确定性，无 LLM）───────────────────────────
def _draft_sha256(draft: str) -> str:
    return _sha256_text(draft)


def _issue_signature(decision: CriticDecision) -> str:
    """Canonical issue-set signature, independent of free-text claim wording."""
    if decision.get("passed"):
        return ""
    parts = sorted(_canonical_issue_signature(issue)
                   for issue in decision.get("issues", []))
    return _sha256_text(json.dumps(parts, ensure_ascii=False)) if parts else ""


def _canonical_issue_signature(issue: CriticIssue) -> str:
    payload = {
        "issue_type": issue.get("issue_type", ""),
        "severity": issue.get("severity", ""),
        "target_text": _norm_for_quote(issue.get("target_text", "")),
        "evidence_ids": sorted(set(issue.get("evidence_ids") or [])),
        "evidence_quote_sha256": _sha256_text(_norm_for_quote(issue.get("evidence_quote", ""))),
    }
    return _sha256_text(json.dumps(payload, ensure_ascii=False, sort_keys=True))


def _assess_candidate(parent_decision: CriticDecision, candidate_decision: CriticDecision,
                      *, protected_region_match: bool, deterministic_before: int,
                      deterministic_after: int) -> dict:
    parent = {_canonical_issue_signature(issue): issue
              for issue in parent_decision.get("issues", [])}
    candidate = {_canonical_issue_signature(issue): issue
                 for issue in candidate_decision.get("issues", [])}
    resolved = sorted(set(parent) - set(candidate))
    unresolved = sorted(set(parent) & set(candidate))
    new = sorted(set(candidate) - set(parent))
    new_high = [signature for signature in new
                if candidate[signature].get("severity") == "high"]
    if not protected_region_match:
        accepted, reason = False, "patch_rejected_protected_region"
    elif deterministic_after > deterministic_before or new_high:
        accepted, reason = False, "candidate_rejected_new_issue"
    elif not resolved:
        accepted, reason = False, "candidate_rejected_no_resolution"
    else:
        accepted, reason = True, "candidate_accepted"
    return {
        "accepted": accepted,
        "reason": reason,
        "resolved_issue_signatures": resolved,
        "unresolved_issue_signatures": unresolved,
        "new_issue_signatures": new,
        "new_high_issue_signatures": new_high,
        "protected_region_match": bool(protected_region_match),
        "deterministic_before": deterministic_before,
        "deterministic_after": deterministic_after,
    }


def _score_candidate(draft: str, evidence: TutorEvidence, initial_draft: str) -> tuple:
    """§8.3 确定性候选评分（越小越好）：高严重度违规/违规总数/ID泄漏/无依据引用/格式违规/离初稿编辑距离。"""
    det = _check_output_contract(draft, evidence)
    types = [i["issue_type"] for i in det]
    high = sum(1 for i in det if i["severity"] == "high")
    edit = 1.0 - difflib.SequenceMatcher(None, draft or "", initial_draft or "").ratio()
    return (high, len(det), types.count("internal_id_leak"),
            types.count("unsupported_citation"), types.count("citation_format"), edit)


def _v2_better(new_score: tuple, best_score: tuple) -> bool:
    """new 是否严格优于 best（字典序更小）；相等不替换（保留更早/更近初稿的稿件）。"""
    return tuple(new_score) < tuple(best_score)


def _v2_resolve_termination(state: "TutorState") -> str:
    """决定 V2 终止原因（node_respond 用）。"""
    if state.get("termination_reason"):
        return state["termination_reason"]
    d = state.get("critic_decision") or {}
    if d.get("passed"):
        return "passed"
    if state.get("step", 0) >= TUTOR_REPAIR_MAX_REVISIONS:
        return "budget_exhausted"
    if not _auto_repairable_issues(d):
        if any(i["issue_type"] == "authority_conflict" for i in d.get("issues", [])):
            return "authority_conflict"
        if ("parse_error" in str(d.get("decision_source", ""))
                or any(i.get("issue_type") == "critic_parse_error"
                       for i in d.get("issues", []))):
            return "critic_parse_error"
        return "low_confidence_issue"
    return "passed"


# ── State定义 ─────────────────────────────────────────────────────────────────
class TutorState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    edu_level: str | None              # 学生学历层次
    retrieved_docs: list[dict]         # 检索到的上下文片段
    evidence: TutorEvidence            # 05 V2：Generate/Critic/Revise 共享证据契约（含 context_sha256）
    draft_answer: str                  # Generator生成的初稿
    gen_contexts: list[str]            # 生成时模型真正看到的上下文（压缩+重排后），供评测 FF 对齐
    critic_issues: str                 # Critic发现的问题（空字符串=无问题）
    critic_ever: bool                  # 复核是否曾触发过（保持 critic_triggered 原语义：曾发现问题/发生修订）
    # ── 05 V2 修复循环状态（仅 TUTOR_REPAIR_V2_ENABLED 时使用）──
    critic_decision: CriticDecision    # 结构化 Critic 决定
    initial_draft: str                 # 初稿（第一候选，回退基准）
    draft_history: list[str]           # 已复核过的稿件 SHA 列表（停滞检测）
    issue_signature_history: list[str] # 问题签名历史（重复问题检测）
    best_draft: str                    # 确定性评分最优稿
    best_score: tuple                  # 最优稿评分（tuple，越小越好）
    termination_reason: str            # V2 终止原因
    final_answer: str                  # 最终答案
    query_vec: list[float] | None      # 预计算 embedding（缓存复用 / 避免重嵌入）
    step: int                          # 已执行的 revise 步骤数（limits.early_stop 使用）
    user_id: str | None                # 用户 ID（四层记忆启用键）
    profile_hint: str                  # 档案卡一行注入（空字符串=无画像）
    summary: str                       # 近期对话摘要（空字符串=未触发）
    current_state: dict                # 结构化工作记忆（话题/已问/待确认）
    timings_ms: dict[str, int]         # 单次请求的阶段耗时；循环节点按阶段累计
    stage_counts: dict[str, int]       # LangGraph 节点调用次数；用于解释循环放大


_TIMING_STAGES = (
    "memory",
    "embedding",
    "cache_lookup",
    "retrieve",
    "generate",
    "critique",
    "revise",
)


def _new_timings() -> dict[str, int]:
    """为每次请求创建独立字典，未发生的阶段保持为 0。"""
    return {stage: 0 for stage in _TIMING_STAGES}


def _new_stage_counts() -> dict[str, int]:
    return {
        "retrieve_calls": 0,
        "generate_calls": 0,
        "critique_calls": 0,
        "revise_calls": 0,
    }


def _increment_stage_count(
    counts: dict[str, int] | None,
    stage: str,
) -> dict[str, int]:
    updated = _new_stage_counts()
    updated.update(counts or {})
    key = f"{stage}_calls"
    updated[key] = updated.get(key, 0) + 1
    return updated


def _record_timing(
    timings: dict[str, int] | None,
    stage: str,
    started_at: float,
) -> dict[str, int]:
    """复制并累计阶段耗时，避免不同 LangGraph 节点覆盖彼此的观测数据。"""
    updated = dict(timings or {})
    elapsed_ms = max(0, int((time.monotonic() - started_at) * 1000))
    updated[stage] = updated.get(stage, 0) + elapsed_ms
    return updated


def _finalize_timings(
    timings: dict[str, int] | None,
    request_started_at: float,
) -> dict[str, int]:
    """补齐稳定字段，并记录从 ask_tutor 入口开始的总耗时。"""
    completed = _new_timings()
    completed.update(timings or {})
    completed["total"] = max(
        0,
        int((time.monotonic() - request_started_at) * 1000),
    )
    return completed


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
        elif d.doc_type == 'experience':
            # 历史好案例：低权重辅助参考，严禁用作法规引用依据（spec C6）
            parts.append(f"【历史参考经验（仅供参考，非法规依据，勿作条款引用）】\n{d.content}")
        else:
            parts.append(f"【教材知识点 {d.id}】{d.title}：{d.content or ''}")
    return '\n\n'.join(parts)


# ── 节点函数 ──────────────────────────────────────────────────────────────────
def node_retrieve(state: TutorState) -> dict:
    started_at = time.monotonic()
    question = state["messages"][-1].content
    with capture_retrieval_timings() as retrieval_timings:
        docs = retrieve(question, edu_level=state.get("edu_level"),
                        query_vec=state.get("query_vec"))
    timings_ms = dict(state.get("timings_ms") or {})
    timings_ms.update(retrieval_timings)
    # score 必须序列化，node_generate 的 reorder_for_llm 依赖它（B4）
    return {
        "retrieved_docs": [
            {"id": d.id, "doc_type": d.doc_type, "title": d.title,
             "content": d.content, "score": d.score}
            for d in docs
        ],
        "timings_ms": _record_timing(timings_ms, "retrieve", started_at),
        "stage_counts": _increment_stage_count(
            state.get("stage_counts"), "retrieve",
        ),
    }


def _format_negative_hint(negatives: list[dict]) -> str:
    """Keep the legacy prompt byte-compatible unless V2 is explicitly enabled."""
    if not negatives:
        return ""
    if TUTOR_REPAIR_V2_ENABLED:
        lines = (
            f"- 错误示例（勿照抄）：{item['bad_answer'][:80]}"
            f"（原因：{item['reason'][:50]}；正确做法：{(item.get('fix_hint') or '')[:60]}）"
            for item in negatives
        )
    else:
        lines = (
            f"- 错误示例（勿照抄）：{item['bad_answer'][:80]}（原因：{item['reason'][:50]}）"
            for item in negatives
        )
    return "\n注意避免以下已知错误模式：\n" + "\n".join(lines)


def node_generate(state: TutorState) -> dict:
    started_at = time.monotonic()
    question = state["messages"][-1].content
    # 统一证据契约：压缩 + 头尾重组 + _format_context（与 _prepare_tutor_evidence 同一逻辑），
    # 供 Generate/Critic/Revise 共享；context/gen_contexts 与旧实现逐字一致，V1 行为不变。
    evidence = _prepare_tutor_evidence(state["retrieved_docs"])
    context = evidence["context"]

    neg_hint = ""
    try:
        from eval.error_book import get_few_shot_negatives
        negatives = get_few_shot_negatives(question, n=3)
        neg_hint = _format_negative_hint(negatives)
    except Exception:
        pass

    cs = state.get("current_state") or {}
    cs_hint = ""
    try:
        from memory.summary import format_current_state
        cs_hint = format_current_state(cs)
    except Exception:
        pass

    llm_messages = _build_generate_messages(
        context, question,
        history=None,  # history already in state["messages"]
        edu_level=state.get("edu_level"),
        profile_hint=state.get("profile_hint", ""),
        summary=state.get("summary", ""),
        negatives_hint=neg_hint,
        current_state_hint=cs_hint,
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
    # 点2：导出模型真正看到的证据（压缩+重排后的分块内容），供评测 FF 严格对齐
    return {
        "draft_answer": draft,
        "evidence": evidence,
        "initial_draft": draft,   # 05 V2：初稿作为第一候选/回退基准
        "gen_contexts": [it["provided_content"] for it in evidence["items"]],
        "timings_ms": _record_timing(state.get("timings_ms"), "generate", started_at),
        "stage_counts": _increment_stage_count(
            state.get("stage_counts"), "generate",
        ),
    }


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


def _cove_verify(draft: str, context: str, llm_fn=None, *, audit: dict | None = None) -> str:
    """
    CoVe 验证链：让模型对草稿中的关键数值/断言逐条自问「参考资料真的说这个吗」。
    - 返回空字符串 → 无矛盾，不触发 revise。
    - 返回非空字符串 → 描述矛盾，触发 revise。
    - llm_fn(prompt: str) -> str | (str, usage) 可注入（测试用，绕开 DashScope）。
    - context/draft 为空时直接跳过（不调 LLM）。
    - audit 可选；填充实际输入、截断、响应、usage 和延迟，返回值仍保持字符串兼容。
    """
    effective_context = context[:2000]
    effective_draft = draft[:1000]
    if audit is not None:
        audit.update({
            "source_context_chars": len(context),
            "effective_context_chars": len(effective_context),
            "context_truncated_chars": len(context) - len(effective_context),
            "source_draft_chars": len(draft),
            "effective_draft_chars": len(effective_draft),
            "draft_truncated_chars": len(draft) - len(effective_draft),
            "source_context_sha256": _sha256_text(context),
            "effective_context_sha256": _sha256_text(effective_context),
            "source_draft_sha256": _sha256_text(draft),
            "effective_draft_sha256": _sha256_text(effective_draft),
            "request_messages": [],
            "raw_response": "",
            "parsed_decision": "skipped_empty_input" if not draft or not context else None,
            "usage": None,
            "latency_ms": 0,
        })
    if not draft or not context:
        return ""

    prompt = (
        "你是GMP法规验证专家。\n\n"
        f"参考资料：\n{effective_context}\n\n"
        f"待验证回答：\n{effective_draft}\n\n"
        "请检查回答中的关键数值声明（如温度、湿度、粒子等级、时限等）是否与参考资料一致。\n"
        "如果全部一致，只回复：VERIFIED\n"
        "如果有矛盾，指出具体矛盾（一句话）。"
    )

    messages = [{"role": "user", "content": prompt}]
    if audit is not None:
        audit["request_messages"] = messages

    started = time.monotonic()
    usage = None
    if llm_fn is not None:
        payload = llm_fn(prompt)
        if isinstance(payload, tuple):
            result, usage = payload
        else:
            result = payload
    else:
        result = _llm_chat(
            messages,
            temperature=0.1,
            model=route_model("critique"),
        )
        calls = getattr(_llm_chat, "calls", None)
        if calls:
            usage = calls[-1].get("usage")

    raw = str(result)
    verified = raw.strip().lower().startswith("verified")
    if audit is not None:
        audit.update({
            "raw_response": raw,
            "parsed_decision": "verified" if verified else "contradiction",
            "usage": usage,
            "latency_ms": max(0, int((time.monotonic() - started) * 1000)),
        })
    return "" if verified else raw.strip()


# 预算用尽仍有未解决问题时，附在答案末尾的如实降级提示（绝不静默输出"看似正常"的答案）
_DEGRADE_NOTICE = (
    "\n\n⚠️ 说明：本回答经多轮自检仍存在未能完全消解的问题，"
    "请谨慎参考，并以现行 GMP 法规原文为准。"
)


def _critique_answer(draft: str, reg_context: str, retrieved_ids: set[str]) -> str:
    """核查答案，返回 critic_issues（空=通过）。**图与流式两条路径共用，保证复核逻辑对称。**
    - 确定性条款幻觉检测（引用了未检索到的条款 → 直接判问题，零成本、不调 LLM）
    - LLM 法规校验（有法规上下文时）
    - CoVe 声明级核查（COVE_ENABLED 且前两步通过时）
    """
    hall = _check_hallucinated_articles(draft, retrieved_ids)
    if hall:
        return hall
    if not reg_context:
        return ""
    prompt = f"""你是GMP法规审核专家。请核查以下答案是否与给出的法规条文存在矛盾或错误。

法规原文：
{reg_context}

待审核答案：
{draft}

如果答案与法规一致，请只回复：PASS
如果发现错误，请指出具体问题（一句话）。"""
    result = _llm_chat([{"role": "user", "content": prompt}],
                       temperature=0.1, model=route_model("critique"))
    issues = "" if result.strip().upper().startswith("PASS") else result.strip()
    if COVE_ENABLED and not issues:
        cove_issues = _cove_verify(draft, reg_context)
        if cove_issues:
            issues = f"[CoVe] {cove_issues}"
    return issues


def _node_critique_v2(state: TutorState, started_at: float) -> dict:
    """V2 Critic：停滞检测(同稿不重审) + 结构化审核 + 候选评分/最佳稿更新 + 重复问题终止。"""
    source_cur = state["draft_answer"]
    cur, sanitize_edits = _sanitize_internal_ids(source_cur)
    cur_sha = _draft_sha256(cur)
    history = state.get("draft_history") or []
    initial = state.get("initial_draft") or cur

    def _timed(d: dict) -> dict:
        d["timings_ms"] = _record_timing(state.get("timings_ms"), "critique", started_at)
        d["stage_counts"] = _increment_stage_count(state.get("stage_counts"), "critique")
        return d

    # 停滞：该稿已复核过（含 revise 未改变稿件）→ 不再调用 Critic
    if cur_sha in history:
        return _timed({"termination_reason": "stalled_same_draft"})

    question = state["messages"][-1].content
    decision = _critique_answer_v2(question, cur, state["evidence"])
    sig = _issue_signature(decision)
    sig_hist = state.get("issue_signature_history") or []
    score = _score_candidate(cur, state["evidence"], initial)
    best_score = state.get("best_score")
    parent_decision = state.get("parent_critic_decision")
    assessment = None
    if parent_decision:
        assessment = _assess_candidate(
            parent_decision, decision,
            protected_region_match=all(
                item.get("protected_region_match") is True
                for item in (state.get("patch_trace") or [])
            ),
            deterministic_before=int(state.get("parent_deterministic_issue_count", 0)),
            deterministic_after=len(_check_output_contract(cur, state["evidence"])),
        )
        if assessment["accepted"]:
            best_draft, best_out = cur, score
        else:
            best_draft = state.get("best_draft") or initial
            best_out = best_score if best_score is not None else _score_candidate(
                best_draft, state["evidence"], initial)
    elif best_score is None or _v2_better(score, best_score):
        best_draft, best_out = cur, score
    else:
        best_draft, best_out = state.get("best_draft") or initial, best_score

    out = {
        "critic_decision": decision,
        "critic_issues": _render_critic_issues(decision),
        "draft_answer": cur,
        "sanitizer_edits": (state.get("sanitizer_edits") or []) + sanitize_edits,
        "draft_history": history + [cur_sha],
        "issue_signature_history": sig_hist + ([sig] if sig else []),
        "best_draft": best_draft, "best_score": best_out, "initial_draft": initial,
        "last_checked_draft_sha256": cur_sha,
        "best_draft_verified": bool(best_draft == cur and decision["passed"]),
        "parent_critic_decision": None,
    }
    if assessment is not None:
        out["candidate_assessment"] = assessment
        if not assessment["accepted"]:
            out["termination_reason"] = assessment["reason"]
    elif sanitize_edits and decision["passed"]:
        out["termination_reason"] = "passed_after_sanitize"
    if decision["issues"]:
        out["critic_ever"] = True
    if (not out.get("termination_reason") and not decision["passed"] and sig
            and sig_hist.count(sig) >= TUTOR_REPAIR_MAX_REPEAT_ISSUES):
        out["termination_reason"] = "stalled_repeated_issue"
    return _timed(out)


def node_critique(state: TutorState) -> dict:
    """Critic节点：V2 走结构化+护栏；V1 保持确定性幻觉检测 + LLM 校验 + CoVe。"""
    started_at = time.monotonic()
    if TUTOR_REPAIR_V2_ENABLED and state.get("evidence"):
        return _node_critique_v2(state, started_at)
    # V1（开关关）：Critic 使用 legacy 前 5 条法规。
    reg_context, retrieved_ids = _critic_evidence_context(state)
    issues = _critique_answer(state["draft_answer"], reg_context, retrieved_ids)
    out: dict = {"critic_issues": issues}
    if issues:
        out["critic_ever"] = True   # 只置 True、不复位：保证多轮复核后仍反映"曾触发"
    out["timings_ms"] = _record_timing(
        state.get("timings_ms"), "critique", started_at,
    )
    out["stage_counts"] = _increment_stage_count(
        state.get("stage_counts"), "critique",
    )
    return out


def node_revise(state: TutorState) -> dict:
    """修订节点：根据Critic意见修正答案。V2 用有证据的最小修订(温度0.1)；V1 保持原盲修(0.3)。"""
    started_at = time.monotonic()
    if TUTOR_REPAIR_V2_ENABLED and state.get("evidence") and state.get("critic_decision"):
        question = state["messages"][-1].content
        messages = _build_revise_messages_v2(
            question, state["draft_answer"], state["critic_decision"], state["evidence"])
        raw_patch = _llm_chat(messages, temperature=0.1, model=route_model("revise"))
        base = {
            "step": state.get("step", 0) + 1,
            "raw_revise_response": raw_patch,
            "timings_ms": _record_timing(state.get("timings_ms"), "revise", started_at),
            "stage_counts": _increment_stage_count(state.get("stage_counts"), "revise"),
        }
        try:
            edits = _parse_revise_patch(raw_patch)
        except ValueError as exc:
            return {**base, "draft_answer": state["draft_answer"],
                    "patch_trace": [], "patch_error": str(exc),
                    "termination_reason": "patch_parse_error"}
        if not edits:
            return {**base, "draft_answer": state["draft_answer"],
                    "patch_trace": [], "termination_reason": "patch_empty"}
        try:
            revised, patch_trace = _apply_verified_patch(
                state["draft_answer"], edits, state["critic_decision"]["issues"],
                state["evidence"],
            )
        except ValueError as exc:
            reason = ("patch_rejected_protected_region" if "overlapping" in str(exc)
                      else "patch_rejected_target")
            return {**base, "draft_answer": state["draft_answer"],
                    "patch_trace": [], "patch_error": str(exc),
                    "termination_reason": reason}
        return {**base, "draft_answer": revised, "patch_trace": patch_trace,
                "parent_critic_decision": state["critic_decision"],
                "parent_draft_sha256": _draft_sha256(state["draft_answer"]),
                "parent_deterministic_issue_count": len(
                    _check_output_contract(state["draft_answer"], state["evidence"]))}
    else:
        prompt = f"""原答案存在以下问题：{state['critic_issues']}

请修正原答案，确保符合GMP法规要求：
{state['draft_answer']}

只输出修正后的答案，不要解释修改原因。"""
        messages = [{"role": "user", "content": prompt}]
        revised = _llm_chat(messages, model=route_model("revise"))
    # 写回 draft_answer（而非直接 final_answer）→ 让修订稿回到 critique 重新复核；step+1 供预算兜底
    return {
        "draft_answer": revised,
        "step": state.get("step", 0) + 1,
        "timings_ms": _record_timing(state.get("timings_ms"), "revise", started_at),
        "stage_counts": _increment_stage_count(
            state.get("stage_counts"), "revise",
        ),
    }


def node_respond(state: TutorState) -> dict:
    """Finalize V3 answer text and keep repair failures in metadata."""
    if TUTOR_REPAIR_V2_ENABLED and state.get("evidence"):
        term = _v2_resolve_termination(state)
        best = state.get("best_draft") or state.get("draft_answer", "")
        current_sha = _draft_sha256(state.get("draft_answer", ""))
        output_sha = _draft_sha256(best)
        last_checked_sha = state.get("last_checked_draft_sha256") or current_sha
        output_verified = bool(
            state.get("critic_decision", {}).get("passed")
            and output_sha == current_sha == last_checked_sha
            and term in {"passed", "passed_after_sanitize"}
        )
        if term == "passed" and not output_verified:
            term = "fallback_output_unverified"
        selection = "current_draft" if output_sha == current_sha else "fallback_to_best"
        final_answer = best
        if not output_verified and _DEGRADE_NOTICE not in final_answer:
            final_answer += _DEGRADE_NOTICE
        return {
            "final_answer": final_answer,
            "termination_reason": term,
            "loop_termination_reason": term,
            "output_selection_reason": selection,
            "output_verified": output_verified,
            "output_draft_sha256": output_sha,
            "last_checked_draft_sha256": last_checked_sha,
            "repair_warning": "" if output_verified else term,
        }
    draft = state["draft_answer"]
    if state.get("critic_issues"):
        return {"final_answer": draft + _DEGRADE_NOTICE}
    return {"final_answer": draft}


def _should_revise(state: TutorState) -> str:
    # V2：用 Tutor 专用预算 + 停滞/可修订性护栏（不走 tool agent 的 MAX_REASONING_STEPS）。
    if TUTOR_REPAIR_V2_ENABLED and state.get("evidence"):
        d = state.get("critic_decision") or {}
        if state.get("termination_reason") or d.get("passed"):
            return "respond"
        if state.get("step", 0) >= TUTOR_REPAIR_MAX_REVISIONS:
            return "respond"
        if not _auto_repairable_issues(d):
            return "respond"
        return "revise"
    from agents.limits import early_stop
    if state.get("critic_issues") and not early_stop(state.get("step", 0)):
        return "revise"
    return "respond"


def _after_revise(state: TutorState) -> str:
    """Patch failures are terminal in both LangGraph and the streaming loop."""
    return "respond" if state.get("termination_reason") else "critique"


def _run_repair_loop_v2(state: TutorState) -> dict:
    """V2 修复循环的单一实现：按与 LangGraph 完全相同的边顺序驱动同一批节点函数。
    图路径由 LangGraph 编排这些节点；流式路径调用本函数——二者复用同一节点，保证一致。
    入参 state 需已含 evidence + draft_answer（generate 之后）。返回合并后的 state。"""
    st = dict(state)
    while True:
        st.update(node_critique(st))
        if _should_revise(st) == "respond":
            st.update(node_respond(st))
            return st
        st.update(node_revise(st))
        if _after_revise(st) == "respond":
            st.update(node_respond(st))
            return st


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
    g.add_conditional_edges(
        "revise", _after_revise, {"critique": "critique", "respond": "respond"},
    )
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
    request_started_at = time.monotonic()
    timings_ms = _new_timings()
    stage_counts = _new_stage_counts()

    # ── 四层记忆：用户档案卡 + 语义级历史过滤 + 摘要（持久化） + current_state ──
    memory_started_at = time.monotonic()
    profile_hint = ""
    summary = ""
    current_state: dict = {}
    filtered_history = list(history or [])

    if user_id and MEMORY_ENABLED:
        try:
            from memory.profile import get_profile, get_profile_hint
            from memory.summary import build_window_and_summary, load_summary, build_current_state
            profile = get_profile(user_id)
            profile_hint = get_profile_hint(profile)
            # 方案A：跨会话摘要从 DB 加载，不依赖前端传参
            stored_summary = load_summary(user_id)
            filtered_history, summary = build_window_and_summary(
                filtered_history, existing_summary=stored_summary, mock_llm=None
            )
            # current_state 工作记忆（话题/已问/待确认）
            current_state = build_current_state(filtered_history, question)
        except Exception:
            pass  # 记忆不可用时静默降级

    timings_ms = _record_timing(timings_ms, "memory", memory_started_at)

    # 把前端传来的历史转成 LangChain Message 对象，只取最近 HISTORY_TURNS 轮
    history_messages: list[BaseMessage] = []
    for msg in filtered_history[-HISTORY_TURNS * 2:]:
        if msg.get("role") == "user":
            history_messages.append(HumanMessage(content=msg["content"]))
        else:
            history_messages.append(AIMessage(content=msg["content"]))

    # 预计算 embedding（用于缓存命中检测，失败则降级）
    embedding_started_at = time.monotonic()
    query_vec: list[float] | None = None
    if SEMANTIC_CACHE_ENABLED:
        from rag.retriever import embed_query
        try:
            query_vec = embed_query(question)
        except Exception:
            pass
    timings_ms = _record_timing(timings_ms, "embedding", embedding_started_at)

    # 语义缓存前置检查（B5）
    if SEMANTIC_CACHE_ENABLED and query_vec:
        cache_lookup_started_at = time.monotonic()
        from cache.semantic_cache import get_cache
        cached = get_cache().get(query_vec, edu_level, user_id)
        timings_ms = _record_timing(timings_ms, "cache_lookup", cache_lookup_started_at)
        if cached:
            return {
                **cached,
                "timings_ms": _finalize_timings(timings_ms, request_started_at),
                "stage_counts": stage_counts,
            }

    initial_state: TutorState = {
        "messages": history_messages + [HumanMessage(content=question)],
        "edu_level": edu_level,
        "retrieved_docs": [],
        "draft_answer": "",
        "gen_contexts": [],
        "critic_issues": "",
        "critic_ever": False,
        "final_answer": "",
        "query_vec": query_vec,
        "step": 0,
        "user_id": user_id,
        "profile_hint": profile_hint,
        "summary": summary,
        "current_state": current_state,
        "timings_ms": timings_ms,
        "stage_counts": stage_counts,
    }
    t0 = time.monotonic()
    result = tutor_graph.invoke(initial_state)
    latency_ms = int((time.monotonic() - t0) * 1000)

    sources = [d["id"] for d in result["retrieved_docs"]]
    # 保持原语义：critic_triggered = 复核是否曾触发（曾发现问题/发生修订），
    # 而非"最终是否仍有问题"（后者由降级提示体现）。与流式路径口径一致。
    critic_triggered = bool(result.get("critic_ever"))
    answer_result = {
        "answer": result["final_answer"],
        "sources": sources,
        "critic_triggered": critic_triggered,
    }

    # 写入语义缓存
    if SEMANTIC_CACHE_ENABLED and query_vec:
        from cache.semantic_cache import get_cache
        get_cache().put(query_vec, edu_level, answer_result, user_id)

    # ── 四层记忆：持久化摘要 + 好 case 经验回流 ──────────────────────────────
    if user_id and MEMORY_ENABLED:
        # C1 方案A：把更新后的 summary 写回 DB（跨会话持久化）
        if summary:
            try:
                from memory.summary import save_summary
                save_summary(user_id, summary)
            except Exception:
                pass
        # C2：经验回流已改为「Critic 通过 + 用户显式正反馈」双门槛（spec C6）。
        # 仅 critic 未触发不足以判定为好 case（可能是模型没自查出问题），
        # 因此不再在此自动回流；回流由 POST /chat/feedback/positive 在用户点赞时触发。

    # ── 四层记忆：异步实体抽取 + 命中率监控 ──────────────────────────────────
    if user_id and MEMORY_ENABLED:
        if PROFILE_ASYNC:
            try:
                from memory.profile import extract_entities_async
                extract_entities_async(question, result["final_answer"], user_id)
            except Exception:
                pass
        else:
            try:
                from memory.profile import upsert_profile
                patch: dict = {}
                if edu_level:
                    patch["edu_level"] = edu_level
                if patch:
                    upsert_profile(user_id, patch)
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

    # 返回本次实际检索到的文档内容，供评估复用（避免二次 retrieve 造成证据错位）。
    # 不放进 answer_result（已缓存）以免膨胀语义缓存；仅附加到返回值。
    # 点2：同时带出 gen_contexts（生成时模型真正看到的压缩+重排上下文），供评测 FF 对齐。
    return {**answer_result,
            "contexts": [d["content"] for d in result["retrieved_docs"]],
            "gen_contexts": result.get("gen_contexts", []),
            "stage_counts": result.get("stage_counts", stage_counts),
            "timings_ms": _finalize_timings(
                result.get("timings_ms"), request_started_at,
            )}


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
    current_state_stream: dict = {}
    filtered_history = list(history or [])
    if user_id and MEMORY_ENABLED:
        try:
            from memory.profile import get_profile, get_profile_hint
            from memory.summary import build_window_and_summary, load_summary, build_current_state
            profile = get_profile(user_id)
            profile_hint = get_profile_hint(profile)
            stored_summary = load_summary(user_id)
            filtered_history, summary = build_window_and_summary(
                filtered_history, existing_summary=stored_summary, mock_llm=None
            )
            current_state_stream = build_current_state(filtered_history, question)
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
            cached = get_cache().get(query_vec, edu_level, user_id)
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
    neg_hint = ""
    try:
        from eval.error_book import get_few_shot_negatives
        negatives = get_few_shot_negatives(question, n=3)
        neg_hint = _format_negative_hint(negatives)
    except Exception:
        pass

    cs_hint_stream = ""
    try:
        from memory.summary import format_current_state
        cs_hint_stream = format_current_state(current_state_stream)
    except Exception:
        pass

    gen_messages = _build_generate_messages(
        context, question, filtered_history, edu_level,
        profile_hint=profile_hint, summary=summary, negatives_hint=neg_hint,
        current_state_hint=cs_hint_stream,
    )
    draft = ""
    try:
        for chunk in _llm_chat_stream(gen_messages):
            draft += chunk
    except Exception:
        draft = _llm_chat(gen_messages)  # 降级到同步

    # 3+4+5. 复核/修订：V2 与图路径复用同一批节点（_run_repair_loop_v2），保证流式=图一致；
    #        V1 保持原缓冲修订循环。两者都缓冲——绝不边改边喷未经复核的内容。
    if TUTOR_REPAIR_V2_ENABLED:
        serial_docs = [{"id": d.id, "doc_type": d.doc_type, "title": d.title,
                        "content": d.content, "score": d.score} for d in docs]
        evidence = _prepare_tutor_evidence(serial_docs)
        loop_state = {
            "messages": [HumanMessage(content=question)],
            "evidence": evidence, "draft_answer": draft, "initial_draft": draft,
            "retrieved_docs": serial_docs, "step": 0,
            "timings_ms": _new_timings(), "stage_counts": _new_stage_counts(),
        }
        result_state = _run_repair_loop_v2(loop_state)
        final_answer = result_state["final_answer"]
        critic_triggered = bool(result_state.get("critic_ever"))
    else:
        retrieved_ids = {d.id for d in docs}
        reg_docs = [d for d in docs if d.doc_type == "regulation"]
        reg_context = "\n".join(f"【{d.id}】{d.content}" for d in reg_docs[:5])
        critic_issues = _critique_answer(draft, reg_context, retrieved_ids)
        critic_triggered = bool(critic_issues)
        from agents.limits import early_stop
        step = 0
        while critic_issues and not early_stop(step):
            revise_prompt = (
                f"原答案存在以下问题：{critic_issues}\n\n"
                f"请修正原答案，确保符合GMP法规要求：\n{draft}\n\n"
                f"只输出修正后的答案，不要解释修改原因。"
            )
            draft = _llm_chat([{"role": "user", "content": revise_prompt}], model=route_model("revise"))
            step += 1
            critic_issues = _critique_answer(draft, reg_context, retrieved_ids)
        final_answer = draft + (_DEGRADE_NOTICE if critic_issues else "")

    # 分块流出最终答案（逐字显示效果）
    for i in range(0, len(final_answer), 8):
        yield f'data: {json.dumps({"chunk": final_answer[i:i+8]}, ensure_ascii=False)}\n\n'
        time.sleep(0.02)

    # 写入缓存（流式版本：回答完整后写入）
    if SEMANTIC_CACHE_ENABLED and query_vec:
        from cache.semantic_cache import get_cache
        get_cache().put(query_vec, edu_level, {
            "answer": final_answer,
            "sources": sources,
            "critic_triggered": critic_triggered,
        }, user_id)

    # 6. done信号
    latency_ms = int((time.monotonic() - t0) * 1000)
    yield (
        f'data: {json.dumps({"done": True, "sources": sources, "critic_triggered": critic_triggered}, ensure_ascii=False)}\n\n'
    )

    # 7. 四层记忆：持久化摘要 + 好 case 经验回流 + 异步实体抽取 + 命中率监控
    if user_id and MEMORY_ENABLED:
        if summary:
            try:
                from memory.summary import save_summary
                save_summary(user_id, summary)
            except Exception:
                pass
        # C2：经验回流已改为「Critic 通过 + 用户显式正反馈」双门槛（spec C6），
        # 见 POST /chat/feedback/positive；此处不再自动回流。
        if PROFILE_ASYNC:
            try:
                from memory.profile import extract_entities_async
                extract_entities_async(question, final_answer, user_id)
            except Exception:
                pass
        else:
            try:
                from memory.profile import upsert_profile
                patch: dict = {}
                if edu_level:
                    patch["edu_level"] = edu_level
                if patch:
                    upsert_profile(user_id, patch)
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
