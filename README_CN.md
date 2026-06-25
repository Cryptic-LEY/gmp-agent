<div align="center">

# 💊 GMP 助学智能体

### 面向药学类专业学生的 AI 驱动 GMP 学习平台

**中文文档** | **[English](./README.md)**

<br/>

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-智能_RAG-FF6B35?logo=chainlink&logoColor=white)](https://langchain-ai.github.io/langgraph/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-469_知识点-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)

<br/>

> *以真实 GMP 检查缺陷为驱动，以游戏化机制为载体*
> *让药品生产质量管理规范真正「学得进、用得上」*

</div>

---

## 🔍 项目简介

**药品 GMP**（《药品生产质量管理规范》）是制药行业质量管理的核心法规，也是药学类专业最难教、最难学的课程之一。

本平台将浙江省 **2022–2025 年真实 GMP 检查缺陷数据**转化为教学场景，以知识图谱、AI 问答、仿真考试和游戏化激励体系为载体，根据学生所学专业和剂型方向实现个性化教学——让法规条文不再枯燥。

---

## ✨ 核心功能

<table>
<tr>
<td width="33%">

**🎯 缺陷驱动教学**
基于浙江省历年检查 TOP 缺陷条款和严重程度分布，将真实失效案例直接转化为练习题、案例和仿真场景。

</td>
<td width="33%">

**🤖 智能 RAG 问答**
LangGraph `检索 → 生成 → 批判 → 回答` 四节点链路，BM25 + 向量混合检索，每条回答溯源对应 GMP 条款原文。

</td>
<td width="33%">

**🎮 游戏化激励**
三币分离体系：XP（角色等级）· 积分（游戏奖励）· 课时分（学业成绩）。连续签到、模块闯关、荣誉等级。

</td>
</tr>
<tr>
<td>

**🗺️ 知识图谱**
469 个知识点以 ECharts 力导向图呈现，叠加个人掌握度四色染色（已掌握 / 薄弱 / 未掌握 / 未学习）。

</td>
<td>

**📊 个性化诊断**
注册时完成前测，自动识别薄弱知识点，按专业 × 剂型生成专属学习路线，开课前完成能力画像。

</td>
<td>

**🏭 剂型主线教学**
片剂 · 注射剂 · 原料药 · 生物制品四大剂型主线，绑定真实产品情境，贯穿全课程始终。

</td>
</tr>
</table>

---

## 🏗️ 技术架构

```
┌──────────────────────────────────────────┐
│              gmp-web  （前端）             │
│   Next.js 15 · TypeScript · Tailwind CSS  │
│   Radix UI · ECharts · Drizzle ORM        │
└───────────────────┬──────────────────────┘
                    │  REST API + SSE 流式
┌───────────────────▼──────────────────────┐
│              gmp-api  （后端）             │
│   FastAPI · LangGraph · SQLite FTS5       │
│   BM25 + 向量混合检索                      │
│   通义千问 qwen3-max（OpenAI 兼容协议）    │
└──────────────────────────────────────────┘
```

**Tutor Agent 处理链路**

```
用户提问 → [检索] BM25 全文 + 向量相似 + 图遍历跳跃
         → [生成] qwen3-max 组织回答
         → [批判] 幻觉检测与自我校验
         → [输出] 最终回答 + GMP 条款来源标注
```

---

## 📦 数据规模

| 数据集 | 数量 |
|--------|------|
| 知识点（专科 + 本科双轨合并） | **469 条** |
| 知识点 → 法规条文关联边 | **7,290 条** |
| 法规库（GMP 2010 正文 + 全套附录） | **1,740 条** |
| 题库（单选 / 多选 / 判断） | **543 道** |
| 案例库（5 大剂型类别） | **117 条** |
| 数据库迁移文件 | **0000 – 0010** |

---

## 🚀 快速启动

> 完整说明见 [SETUP.md](./SETUP.md)

```bash
# 1. 克隆仓库
git clone https://github.com/Cryptic-LEY/gmp-agent.git
cd gmp-agent

# 2. 启动前端
cd gmp-web && npm install
cp .env.local.example .env.local   # 填入 JWT_SECRET（任意字符串）
npx tsx db/migrate.ts              # 初始化表结构
npm run dev                         # → http://localhost:3000

# 3. 启动后端
cd ../gmp-api
pip install -r requirements.txt
cp .env.example .env               # 填入 DASHSCOPE_API_KEY
uvicorn main:app --reload --port 8001
```

> ⚠️ `gmp.db`（58 MB，含题库和知识图谱）未包含在仓库中，请联系项目负责人获取，放置于 `gmp-web/gmp.db`。

---

## 🗂️ 目录结构

```
gmp-agent/
├── gmp-web/                      # Next.js 15 前端
│   ├── app/
│   │   ├── (main)/               # 登录后主功能页
│   │   │   ├── dashboard/        # 数据看板、知识图谱、游戏状态
│   │   │   ├── practice/         # 每日自适应练习
│   │   │   ├── simulation/       # 剂型情境仿真考试
│   │   │   ├── report/           # 成绩报告 & KP 掌握度分析
│   │   │   ├── streak/           # 签到打卡日历
│   │   │   └── profile/          # 学籍信息 & 个人设置
│   │   └── api/                  # Next.js API 路由
│   │       ├── auth/             # JWT 登录 / 注册
│   │       ├── game/             # XP、积分、签到
│   │       ├── onboarding/       # 前测 + 学习方案生成
│   │       ├── practice/         # 出题引擎
│   │       ├── simulation/       # 仿真考试引擎
│   │       ├── graph/            # 知识图谱数据
│   │       └── agent/            # RAG 问答代理
│   └── db/
│       ├── schema.ts             # Drizzle ORM 表结构定义
│       └── migrations/           # SQL 迁移历史（0000–0010）
│
├── gmp-api/                      # FastAPI 后端
│   ├── agents/tutor.py           # LangGraph Tutor Agent
│   ├── rag/                      # 混合检索器 + 向量 Embedder
│   └── config.py                 # 模型参数与 RAG 配置
│
└── SETUP.md                      # 本地启动指南
```

---

## 🧪 适用场景

- 🎓 **院校专业课**：支持专科（92学时）/ 本科（116学时）双轨课程体系
- 🏫 **自主部署**：开发用 SQLite，上线一行切换 PostgreSQL（Drizzle ORM 零迁移成本）
- 📋 **GMP 认证备考**：完整覆盖 2010 版 GMP 313 条正文 + 无菌 / 验证 / 原料药等全套附录

---

## 🛠️ 技术栈

| 层次 | 技术选型 |
|------|---------|
| 前端 | Next.js 15, React 19, TypeScript, Tailwind CSS, Radix UI, ECharts |
| 后端 | FastAPI, LangGraph, Python 3.11 |
| AI / LLM | 通义千问 qwen3-max（DashScope），text-embedding-v3 |
| 检索 | SQLite FTS5（BM25）+ 余弦向量检索 + 图跳跃遍历 |
| 数据库 | SQLite + Drizzle ORM（可一键迁移 PostgreSQL） |
| 认证 | JWT（jose）+ bcrypt 密码哈希 |

---

<div align="center">

为中国药学教育而生 ❤️

*Powered by [LangGraph](https://langchain-ai.github.io/langgraph/) · [通义千问](https://qwenlm.github.io/) · [Next.js](https://nextjs.org/)*

</div>
