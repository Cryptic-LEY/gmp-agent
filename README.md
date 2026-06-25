<div align="center">

<img src="./gmp-web/public/gmp-logo.png" alt="GMP Agent Logo" width="96"/>

# GMP Learning Agent

### AI-Powered GMP Education Platform for Pharmaceutical Students

**[中文文档](./README_CN.md)** · **English**

<br/>

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-Agentic_RAG-FF6B35)](https://langchain-ai.github.io/langgraph/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MySQL](https://img.shields.io/badge/MySQL-9.x-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Tests](https://img.shields.io/badge/Tests-230_passing-22c55e)](./gmp-api)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)

<br/>

> *Real GMP inspection defects → adaptive learning scenarios → gamified mastery.*
> Built for pharmacy & pharmaceutical engineering students in China.

</div>

---

## What is this?

China's **Good Manufacturing Practice (GMP)** regulation is the backbone of pharmaceutical quality management — and one of the hardest subjects to teach effectively.

This platform transforms **real GMP inspection findings** from Zhejiang Province (2022–2025) into interactive learning: knowledge graphs, AI tutoring with tool-calling, simulation exams, course modules with discussion forums, and a gamified progression system — all tailored to the student's major and dosage-form track. Teachers and admins get a dedicated portal to manage courses, assignments, and analytics.

---

## Features

<table>
<tr>
<td width="50%">

**🤖 Enterprise-Grade RAG Agent**
LangGraph `retrieve → generate → critique → respond` pipeline with full **Function Calling** (7-step FC loop, 6 built-in tools). HNSW + BM25 hybrid retrieval, gte-rerank cross-encoder, small-to-big chunking. Every answer cites the exact GMP clause. Hard constraint protection ensures negations ("不得"/"禁止") are never dropped by compression. Conversations are **persisted** — pick up where you left off.

</td>
<td width="50%">

**📚 Full Course Module**
11 chapters mapped to T01–T11 training projects. Each chapter has: KP list with mastery, regulation references, an AI classroom, a chapter quiz, simulation drill, discussion forum, and assignment submissions — all in one place.

</td>
</tr>
<tr>
<td>

**🎯 Defect-Driven Learning**
Real inspection data (top defect clauses, severity distribution) shapes every exercise, case, and quiz — not textbook theory alone. 590 skill points extracted from 13 defect template documents.

</td>
<td>

**🎮 Gamified Progression**
Three-currency system: XP (character level) · Points (rewards) · Credits (academic score). Daily streaks, module unlocks, boss battles, class leaderboard. Spaced-repetition review queue driven by forgetting-curve data.

</td>
</tr>
<tr>
<td>

**🗺️ Knowledge Graph**
469 knowledge points visualized as a force-directed graph (ECharts). Personal mastery overlay with 4-tier color scale — see exactly where you stand across 7,290 KP→regulation edges.

</td>
<td>

**👩‍🏫 Teacher & Admin Portals**
Teachers publish assignments, view class analytics, browse the question bank, and export CSVs. Admins manage users, knowledge-point dependencies, and system config — all without touching the database.

</td>
</tr>
</table>

---

## Architecture

```
┌──────────────────────────────────────────────┐
│               gmp-web  (Frontend)             │
│  Next.js 15 · TypeScript · Tailwind · Radix   │
│  ECharts · Drizzle ORM · MySQL2               │
└──────────────────┬───────────────────────────┘
                   │  REST API + SSE stream
┌──────────────────▼───────────────────────────┐
│               gmp-api  (Backend)              │
│  FastAPI · LangGraph · pymysql                │
│                                               │
│  ┌─────────────────────────────────────────┐ │
│  │           Four-Layer Memory             │ │
│  │  user profile · summary · working mem   │ │
│  └─────────────────────────────────────────┘ │
│                                               │
│  ┌─────────────────────────────────────────┐ │
│  │         RAG Pipeline (Spec 01-02)        │ │
│  │  Semantic Cache → HNSW + BM25 Hybrid    │ │
│  │  gte-rerank → Hard Constraint Guard     │ │
│  │  Token Compression → Head-Tail Reorder  │ │
│  └─────────────────────────────────────────┘ │
│                                               │
│  ┌─────────────────────────────────────────┐ │
│  │      Agent & Tool Loop (Spec 05-06)     │ │
│  │  7-step FC loop · 6 tools · Loop Guard  │ │
│  │  HITL gate · MCP Server (default off)   │ │
│  └─────────────────────────────────────────┘ │
│                                               │
│  ┌─────────────────────────────────────────┐ │
│  │       Evaluation Loop (Spec 04/07)      │ │
│  │  RAGAS 3-dim · SelfCheckGPT · CoVe      │ │
│  │  35-item golden set · error book        │ │
│  └─────────────────────────────────────────┘ │
│                                               │
│  Qwen3-max + qwen-turbo  (DashScope)          │
└──────────────────────────────────────────────┘
                   │  shared
┌──────────────────▼───────────────────────────┐
│         MySQL 9.x  (single database)          │
│  25 tables · 37,000+ rows · FULLTEXT indexed  │
└──────────────────────────────────────────────┘
```

**Tutor Agent pipeline**

```
question → [semantic cache]  hit → return in <100ms
         → [retrieve]   HNSW + BM25 hybrid → gte-rerank → small-to-big
         → [compress]   hard constraint protection + token compression
         → [generate]   Qwen3-max
         → [critique]   hallucination check + CoVe online correction
         → [tool loop]  FC 7-step if action intent detected (Guard: max 8 steps)
         → [respond]    answer + GMP clause citations  (SSE stream)
         → [persist]    chat_messages → shown on next load
         → [feedback]   "wrong answer" → error_book → few-shot injection
```

---

## Dataset at a Glance

| Dataset | Count |
|---------|------:|
| Knowledge points (associate + bachelor dual-track) | **469** |
| KP → regulation clause edges | **7,290** |
| GMP 2010 regulation library (articles + annexes) | **1,740** |
| Question bank (MCQ / multi-select / T-F / essay) | **543** |
| Case library (5 dosage-form categories, 18 products) | **117** |
| Skill points (extracted from defect template docs) | **590** |
| Skill → KP links (3-tier confidence) | **24,145** |
| Training projects (simulation scenarios) | **11** |
| RAGAS golden set (evaluation) | **35** |

---

## Role Map

| Role | Entry | Capabilities |
|------|-------|-------------|
| **Student** | `/dashboard` → onboarding pre-test | All learning features + gamification |
| **Teacher** | `/teacher` | Assignments, student analytics, question bank, CSV export |
| **Admin** | `/admin` | User CRUD, KP dependency graph, system config |

---

## Quick Start

> Full setup: [SETUP.md](./SETUP.md)

**Prerequisites:** Node 20+, Python 3.11+, MySQL 8+

```bash
# 1. Clone
git clone https://github.com/Cryptic-LEY/gmp-agent.git
cd gmp-agent

# 2. Database — run the DDL against your MySQL instance
mysql -u root gmp < gmp-web/db/migrations-mysql/0000_init_mysql.sql

# 3. Frontend
cd gmp-web
npm install
cp .env.local.example .env.local   # fill JWT_SECRET + MySQL credentials
npm run dev                         # → http://localhost:3000

# 4. Backend
cd ../gmp-api
pip install -r requirements.txt
cp .env.example .env               # fill DASHSCOPE_API_KEY + MySQL credentials
uvicorn main:app --reload --port 8001
```

> The question bank and knowledge graph data (~37,000 rows) are not in the repo. Contact the maintainer for a MySQL dump.

---

## Project Structure

```
gmp-agent/
├── gmp-web/                        # Next.js 15 frontend + API routes
│   ├── app/
│   │   ├── (main)/
│   │   │   ├── dashboard/          # Hero stats, knowledge graph, streaks
│   │   │   ├── course/             # 11-chapter course module
│   │   │   │   └── [trainingId]/   # Chapter detail: quiz, sim, discussion, assignments
│   │   │   ├── chat/               # AI tutor (persistent, with feedback)
│   │   │   ├── practice/           # Daily adaptive quiz (5 modes)
│   │   │   ├── simulation/         # RPG-style case exam (map, boss, wallet)
│   │   │   ├── plan/               # Personalized learning plan
│   │   │   ├── report/             # Score & KP mastery report
│   │   │   └── profile/            # Student info & settings
│   │   ├── admin/                  # Admin portal
│   │   ├── teacher/                # Teacher portal
│   │   └── api/                    # Route handlers (39 endpoints)
│   └── db/
│       ├── schema.ts               # Drizzle ORM — 25 tables
│       └── migrations-mysql/       # Full MySQL DDL history
│
├── gmp-api/                        # FastAPI + LangGraph backend
│   ├── agents/
│   │   ├── tutor.py                # LangGraph Tutor Agent + CoVe
│   │   ├── tool_agent.py           # 7-step Function Calling loop
│   │   ├── guard.py                # Loop guard (steps + tokens + repeat detection)
│   │   ├── hitl.py                 # Human-in-the-loop approval gate
│   │   ├── router.py               # Large/small model routing
│   │   └── limits.py               # MAX_REASONING_STEPS soft cap
│   ├── rag/
│   │   ├── retriever.py            # HNSW + BM25 hybrid retrieval
│   │   ├── vector_index.py         # In-process HNSW index (faiss)
│   │   ├── embedder.py             # text-embedding-v3 batch generation
│   │   ├── reranker.py             # gte-rerank cross-encoder
│   │   ├── chunker.py              # Small-to-big chunking (300/1800 chars)
│   │   ├── compressor.py           # Hard constraint protection + token compression
│   │   └── hyde.py                 # HyDE (default off)
│   ├── tools/                      # Tool framework (base, registry, validation, runtime)
│   │   └── builtin/                # 6 built-in tools (search, profile, learning, content)
│   ├── memory/                     # Four-layer memory (profile, summary, experience)
│   ├── cache/                      # Semantic cache (cosine similarity LRU)
│   ├── eval/                       # RAGAS eval, SelfCheckGPT, golden set, error book
│   ├── mcp/                        # MCP Server (Tools/Resources/Prompts, default off)
│   ├── migrations/                 # MySQL migration SQL files
│   ├── main.py                     # FastAPI entry: /chat/tutor, /chat/agent, /chat/feedback
│   └── config.py                   # All tunable parameters (22 new configs)
│
└── SETUP.md
```

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, Radix UI, ECharts |
| Backend | FastAPI, LangGraph, Python 3.11 |
| AI / LLM | Qwen3-max + qwen-turbo (DashScope), `text-embedding-v3`, `gte-rerank` |
| Retrieval | In-process HNSW (faiss) + MySQL FULLTEXT (BM25) + gte-rerank + KP graph hop |
| Memory | Four-layer: user profile card · recursive summary · working memory · experience recall |
| Evaluation | RAGAS (CP/FF/AR) · SelfCheckGPT · CoVe · 35-item golden set · error book |
| Agent | 7-step FC loop · 6 tools · loop guard · HITL · MCP Server |
| Database | MySQL 9.x, Drizzle ORM (mysql2) |
| Auth | JWT (jose) + bcrypt |
| Tests | 230 pytest tests (all passing, zero paid-API dependencies) |

---

## Use Cases

- **University courses** — Supports 48-credit (associate) and 54-credit (bachelor) dual-track curricula; academic credits tracked per module
- **Self-hosted by colleges** — Single MySQL instance; teacher + admin portals included out of the box
- **GMP certification prep** — Full coverage of GMP 2010 (313 articles) + all annexes, linked to 469 knowledge points

---

<div align="center">

Built for pharmaceutical education in China

*Powered by [LangGraph](https://langchain-ai.github.io/langgraph/) · [Qwen3](https://qwenlm.github.io/) · [Next.js](https://nextjs.org/)*

</div>
