<div align="center">

# 💊 GMP Learning Agent

### AI-Powered GMP Education Platform for Pharmaceutical Students

**[中文文档](./README_CN.md)** | **English**

<br/>

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-Agentic_RAG-FF6B35?logo=chainlink&logoColor=white)](https://langchain-ai.github.io/langgraph/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-469_KPs-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)

<br/>

> *Real GMP inspection defects → adaptive learning scenarios → gamified mastery.*
> Built for pharmacy & pharmaceutical engineering students in China.

</div>

---

## 🔍 What is this?

China's **Good Manufacturing Practice (GMP)** regulation is the backbone of pharmaceutical quality management — and one of the hardest subjects to teach effectively.

This platform bridges the gap by transforming **real GMP inspection findings** from Zhejiang Province (2022–2025) into interactive learning experiences: knowledge graphs, AI tutoring, simulation exams, and a gamified progression system — all tailored to the student's major and dosage form track.

---

## ✨ Key Features

<table>
<tr>
<td width="33%">

**🎯 Defect-Driven Learning**
Real inspection data (TOP defect clauses, severity distribution) directly shapes every exercise, case, and quiz — not textbook theory alone.

</td>
<td width="33%">

**🤖 Agentic RAG Tutor**
LangGraph `retrieve → generate → critique → respond` pipeline. Hybrid BM25 + vector retrieval. Every answer cites the exact GMP clause.

</td>
<td width="33%">

**🎮 Gamified Progression**
Three-currency system: XP (character level) · Points (rewards) · Credits (academic score). Daily streaks, module unlocks, leaderboards.

</td>
</tr>
<tr>
<td>

**🗺️ Knowledge Graph**
469 knowledge points visualized as a force-directed graph (ECharts). Overlays personal mastery with a 4-tier color scale — see exactly where you stand.

</td>
<td>

**📊 Adaptive Diagnostics**
Pre-test maps weak KPs automatically. Generates a personalized study path by major × dosage form before the student takes their first lesson.

</td>
<td>

**🏭 Dosage Form Tracks**
Tablets · Injectables · APIs · Biologics. Each track binds a real product scenario that runs through the entire curriculum — context-first, always.

</td>
</tr>
</table>

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────┐
│              gmp-web  (Frontend)          │
│   Next.js 15 · TypeScript · Tailwind CSS  │
│   Radix UI · ECharts · Drizzle ORM        │
└───────────────────┬──────────────────────┘
                    │  REST API + SSE stream
┌───────────────────▼──────────────────────┐
│              gmp-api  (Backend)           │
│   FastAPI · LangGraph · SQLite FTS5       │
│   BM25 + Vector hybrid retrieval          │
│   Qwen3 (DashScope OpenAI-compat.)        │
└──────────────────────────────────────────┘
```

**Tutor Agent pipeline**

```
question → [retrieve] BM25 + vector + graph hop
         → [generate] Qwen3-max
         → [critique] hallucination check
         → [respond]  answer + GMP clause citations
```

---

## 📦 Dataset at a Glance

| Dataset | Size |
|---------|------|
| Knowledge Points (associate + bachelor dual-track) | **469** |
| KP → Regulation clause edges | **7,290** |
| GMP 2010 regulation library (articles + annexes) | **1,740** |
| Question bank (MCQ / multi-select / T-F) | **543** |
| Case library (5 dosage-form categories) | **117** |
| DB migrations | **0000 – 0010** |

---

## 🚀 Quick Start

> Full setup guide: [SETUP.md](./SETUP.md)

```bash
# 1. Clone
git clone https://github.com/Cryptic-LEY/gmp-agent.git
cd gmp-agent

# 2. Frontend
cd gmp-web && npm install
cp .env.local.example .env.local   # set JWT_SECRET
npx tsx db/migrate.ts
npm run dev                         # → http://localhost:3000

# 3. Backend
cd ../gmp-api
pip install -r requirements.txt
cp .env.example .env               # set DASHSCOPE_API_KEY
uvicorn main:app --reload --port 8001
```

> ⚠️ `gmp.db` (58 MB — question bank + knowledge graph) is not in the repo. Contact the maintainer to obtain it and place it at `gmp-web/gmp.db`.

---

## 🗂️ Project Structure

```
gmp-agent/
├── gmp-web/                      # Next.js 15 frontend
│   ├── app/
│   │   ├── (main)/               # Protected pages
│   │   │   ├── dashboard/        # Hero stats, knowledge graph, streaks
│   │   │   ├── practice/         # Daily adaptive quiz
│   │   │   ├── simulation/       # Timed case-based exam
│   │   │   ├── report/           # Score & KP mastery report
│   │   │   ├── streak/           # Check-in calendar
│   │   │   └── profile/          # Student info & settings
│   │   └── api/                  # Route handlers
│   │       ├── auth/             # JWT login / register
│   │       ├── game/             # XP, points, streak
│   │       ├── onboarding/       # Pre-test + learning plan
│   │       ├── practice/         # Quiz engine
│   │       ├── simulation/       # Case exam engine
│   │       ├── graph/            # Knowledge graph data
│   │       └── agent/            # Proxy to RAG tutor
│   └── db/
│       ├── schema.ts             # Drizzle ORM schema
│       └── migrations/           # SQL migration history
│
├── gmp-api/                      # FastAPI backend
│   ├── agents/tutor.py           # LangGraph Tutor Agent
│   ├── rag/                      # Hybrid retriever + embedder
│   └── config.py                 # Model & RAG parameters
│
└── SETUP.md
```

---

## 🧪 Use Cases

- 🎓 **University courses** — Supports 92-credit (associate) and 116-credit (bachelor) dual-track curricula
- 🏫 **Self-hosted by colleges** — SQLite in dev, one-line migration to PostgreSQL for production
- 📋 **GMP certification prep** — Full coverage of GMP 2010 (313 articles) + all annexes

---

## 🛠️ Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, Radix UI, ECharts |
| Backend | FastAPI, LangGraph, Python 3.11 |
| AI / LLM | Qwen3-max (DashScope), `text-embedding-v3` |
| Retrieval | SQLite FTS5 (BM25) + cosine vector search + graph hop |
| Database | SQLite + Drizzle ORM (PostgreSQL-ready) |
| Auth | JWT (jose) + bcrypt |

---

<div align="center">

Built with ❤️ for pharmaceutical education in China

*Powered by [LangGraph](https://langchain-ai.github.io/langgraph/) · [Qwen3](https://qwenlm.github.io/) · [Next.js](https://nextjs.org/)*

</div>
