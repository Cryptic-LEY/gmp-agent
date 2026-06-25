<div align="center">

# GMP 助学智能体

### 面向药学类专业学生的 AI 驱动 GMP 学习平台

**中文文档** | **[English](./README.md)**

<br/>

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-智能_RAG-FF6B35?logo=chainlink&logoColor=white)](https://langchain-ai.github.io/langgraph/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MySQL](https://img.shields.io/badge/MySQL-9.x-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Tests](https://img.shields.io/badge/测试-230_通过-22c55e)](./gmp-api)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)

<br/>

> *以真实 GMP 检查缺陷为驱动，以游戏化机制为载体*
> *让药品生产质量管理规范真正「学得进、用得上」*

</div>

---

## 项目简介

**药品 GMP**（《药品生产质量管理规范》）是制药行业质量管理的核心法规，也是药学类专业最难教、最难学的课程之一。

本平台将浙江省 **2022–2025 年真实 GMP 检查缺陷数据**转化为教学场景，以知识图谱、AI 问答、仿真考试和游戏化激励体系为载体，根据学生所学专业和剂型方向实现个性化教学——让法规条文不再枯燥。教师和管理员拥有独立门户，可管理课程、作业和数据看板。

---

## 核心功能

<table>
<tr>
<td width="50%">

**🤖 企业级 RAG 智能体**
LangGraph `检索 → 生成 → 批判 → 回答` 四节点链路，具备完整 **Function Calling** 能力（7 步 FC 循环、6 个内置工具）。HNSW + BM25 混合检索，gte-rerank 精排，小到大分块策略。硬约束保护确保"不得"/"禁止"等否定句在上下文压缩中不被丢失。对话持久化——随时从上次继续。

</td>
<td width="50%">

**📚 完整课程模块**
11 章内容对应 T01–T11 培训项目。每章包含：知识点掌握度列表、法规引用、AI 课堂、章节测验、仿真演练、讨论区和作业提交——全部在同一页面。

</td>
</tr>
<tr>
<td>

**🎯 缺陷驱动教学**
基于浙江省历年检查 TOP 缺陷条款和严重程度分布，将真实失效案例直接转化为练习题、案例和仿真场景。从 13 份缺陷模板文档中提取 590 个技能点。

</td>
<td>

**🎮 游戏化激励**
三币分离体系：XP（角色等级）· 积分（游戏奖励）· 课时分（学业成绩）。连续签到、模块闯关、Boss 战、班级排行榜。遗忘曲线驱动的间隔重复复习队列。

</td>
</tr>
<tr>
<td>

**🗺️ 知识图谱**
469 个知识点以 ECharts 力导向图呈现，叠加个人掌握度四色染色（已掌握 / 薄弱 / 未掌握 / 未学习），覆盖 7,290 条 KP→条文关联边。

</td>
<td>

**👩‍🏫 教师与管理员门户**
教师发布作业、查看班级数据分析、浏览题库、导出 CSV。管理员管理用户、知识点依赖图、系统配置——无需直接操作数据库。

</td>
</tr>
</table>

---

## 技术架构

```
┌──────────────────────────────────────────┐
│              gmp-web  （前端）             │
│   Next.js 15 · TypeScript · Tailwind CSS  │
│   Radix UI · ECharts · Drizzle ORM        │
└───────────────────┬──────────────────────┘
                    │  REST API + SSE 流式
┌───────────────────▼──────────────────────┐
│              gmp-api  （后端）             │
│   FastAPI · LangGraph · pymysql           │
│                                           │
│  ┌───────────────────────────────────┐   │
│  │         四层记忆体系               │   │
│  │  用户画像 · 摘要 · 工作记忆        │   │
│  └───────────────────────────────────┘   │
│                                           │
│  ┌───────────────────────────────────┐   │
│  │      RAG 管道（Spec 01-02）        │   │
│  │  语义缓存 → HNSW+BM25 混合检索    │   │
│  │  gte-rerank → 硬约束保护          │   │
│  │  Token 压缩 → 首尾重排序          │   │
│  └───────────────────────────────────┘   │
│                                           │
│  ┌───────────────────────────────────┐   │
│  │    Agent 工具循环（Spec 05-06）    │   │
│  │  7步FC循环 · 6工具 · 循环守卫     │   │
│  │  人工审核门控 · MCP Server        │   │
│  └───────────────────────────────────┘   │
│                                           │
│  ┌───────────────────────────────────┐   │
│  │    评估闭环（Spec 04/07）          │   │
│  │  RAGAS 3维 · SelfCheckGPT · CoVe  │   │
│  │  35题黄金集 · 错题本              │   │
│  └───────────────────────────────────┘   │
│                                           │
│   通义千问 qwen3-max + qwen-turbo         │
└──────────────────────────────────────────┘
                    │  共享
┌───────────────────▼──────────────────────┐
│         MySQL 9.x  （单库实例）            │
│  25 张表 · 37,000+ 行 · FULLTEXT 索引     │
└──────────────────────────────────────────┘
```

**Tutor Agent 处理链路**

```
用户提问 → [语义缓存]  命中 → <100ms 返回
         → [检索]   HNSW+BM25 混合 → gte-rerank → 小到大分块
         → [压缩]   硬约束保护 + Token 压缩
         → [生成]   qwen3-max
         → [批判]   幻觉检测 + CoVe 在线修正
         → [工具循环] 检测到动作意图时触发（守卫：最多8步）
         → [输出]   回答 + GMP 条款来源标注（SSE 流式）
         → [持久化]  chat_messages 表 → 下次加载时显示
         → [反馈]   「答错了」→ 错题本 → few-shot 注入
```

---

## 数据规模

| 数据集 | 数量 |
|--------|------|
| 知识点（专科 + 本科双轨合并） | **469 条** |
| 知识点 → 法规条文关联边 | **7,290 条** |
| 法规库（GMP 2010 正文 + 全套附录） | **1,740 条** |
| 题库（单选 / 多选 / 判断 / 论述） | **543 道** |
| 案例库（5 大剂型类别，18 个产品情境） | **117 条** |
| 技能点（从缺陷模板文档中提取） | **590 条** |
| 技能点 → 知识点关联（三级置信度） | **24,145 条** |
| 培训项目（仿真场景） | **11 个** |
| RAGAS 黄金评估集 | **35 题** |

---

## 角色权限

| 角色 | 入口 | 功能范围 |
|------|------|---------|
| **学生** | `/dashboard` → 入学前测 | 全部学习功能 + 游戏化体系 |
| **教师** | `/teacher` | 作业管理、班级数据分析、题库、CSV 导出 |
| **管理员** | `/admin` | 用户 CRUD、知识点依赖图、系统配置 |

---

## 快速启动

> 完整说明见 [SETUP.md](./SETUP.md)

**前置条件：** Node 20+，Python 3.11+，MySQL 8+

```bash
# 1. 克隆仓库
git clone https://github.com/Cryptic-LEY/gmp-agent.git
cd gmp-agent

# 2. 初始化数据库
mysql -u root gmp < gmp-web/db/migrations-mysql/0000_init_mysql.sql

# 3. 启动前端
cd gmp-web
npm install
cp .env.local.example .env.local   # 填入 JWT_SECRET + MySQL 连接信息
npm run dev                         # → http://localhost:3000

# 4. 启动后端
cd ../gmp-api
pip install -r requirements.txt
cp .env.example .env               # 填入 DASHSCOPE_API_KEY + MySQL 连接信息
uvicorn main:app --reload --port 8001
```

> 题库和知识图谱数据（约 37,000 行）未包含在仓库中，请联系项目负责人获取 MySQL dump 文件。

---

## 目录结构

```
gmp-agent/
├── gmp-web/                      # Next.js 15 前端 + API 路由
│   ├── app/
│   │   ├── (main)/               # 登录后主功能页
│   │   │   ├── dashboard/        # 数据看板、知识图谱、游戏状态
│   │   │   ├── course/           # 11 章课程模块
│   │   │   │   └── [trainingId]/ # 章节详情：测验/仿真/讨论区/作业
│   │   │   ├── chat/             # AI 问答（持久化 + 反馈）
│   │   │   ├── practice/         # 每日自适应练习（5 种模式）
│   │   │   ├── simulation/       # RPG 式剂型仿真考试（地图/Boss/钱包）
│   │   │   ├── plan/             # 个性化学习计划
│   │   │   ├── report/           # 成绩报告 & KP 掌握度分析
│   │   │   └── profile/          # 学籍信息 & 个人设置
│   │   ├── admin/                # 管理员门户
│   │   ├── teacher/              # 教师门户
│   │   └── api/                  # API 路由（39 个端点）
│   └── db/
│       ├── schema.ts             # Drizzle ORM — 25 张表
│       └── migrations-mysql/     # MySQL DDL 迁移历史
│
├── gmp-api/                      # FastAPI + LangGraph 后端
│   ├── agents/
│   │   ├── tutor.py              # LangGraph Tutor Agent + CoVe
│   │   ├── tool_agent.py         # 7 步 Function Calling 循环
│   │   ├── guard.py              # 循环守卫（步数+Token+重复检测）
│   │   ├── hitl.py               # 人工审核门控
│   │   ├── router.py             # 大小模型路由
│   │   └── limits.py             # 最大推理步数软上限
│   ├── rag/
│   │   ├── retriever.py          # HNSW + BM25 混合检索
│   │   ├── vector_index.py       # 进程内 HNSW 索引（faiss）
│   │   ├── embedder.py           # text-embedding-v3 批量生成
│   │   ├── reranker.py           # gte-rerank 精排
│   │   ├── chunker.py            # 小到大分块（300/1800 字符）
│   │   ├── compressor.py         # 硬约束保护 + Token 压缩
│   │   └── hyde.py               # HyDE 假设文档扩展（默认关闭）
│   ├── tools/                    # 工具框架（基类/注册表/校验/运行时）
│   │   └── builtin/              # 6 个内置工具（搜索/画像/学习/内容）
│   ├── memory/                   # 四层记忆（画像/摘要/经验）
│   ├── cache/                    # 语义缓存（余弦相似度 LRU）
│   ├── eval/                     # RAGAS 评估/SelfCheckGPT/黄金集/错题本
│   ├── mcp/                      # MCP Server（Tools/Resources/Prompts，默认关闭）
│   ├── migrations/               # MySQL 迁移 SQL 文件
│   ├── main.py                   # FastAPI 入口：/chat/tutor /chat/agent /chat/feedback
│   └── config.py                 # 全部可调参数（22 个新增配置项）
│
└── SETUP.md                      # 本地启动指南
```

---

## 技术栈

| 层次 | 技术选型 |
|------|---------|
| 前端 | Next.js 15, React 19, TypeScript, Tailwind CSS, Radix UI, ECharts |
| 后端 | FastAPI, LangGraph, Python 3.11 |
| AI / LLM | 通义千问 qwen3-max + qwen-turbo（DashScope），text-embedding-v3，gte-rerank |
| 检索 | 进程内 HNSW（faiss）+ MySQL FULLTEXT（BM25）+ gte-rerank 精排 + 图跳跃遍历 |
| 记忆 | 四层：用户画像卡 · 递归摘要 · 工作记忆 · 经验召回 |
| 评估 | RAGAS（CP/FF/AR）· SelfCheckGPT · CoVe · 35 题黄金集 · 错题本 |
| Agent | 7 步 FC 循环 · 6 工具 · 循环守卫 · HITL · MCP Server |
| 数据库 | MySQL 9.x，Drizzle ORM（mysql2） |
| 认证 | JWT（jose）+ bcrypt 密码哈希 |
| 测试 | 230 个 pytest 测试（全部通过，无付费 API 依赖） |

---

## 适用场景

- **院校专业课**：支持专科（48 学分）/ 本科（54 学分）双轨课程体系，学业课时分按模块独立计算
- **院校自主部署**：单 MySQL 实例，教师和管理员门户开箱即用
- **GMP 认证备考**：完整覆盖 2010 版 GMP 313 条正文 + 无菌 / 验证 / 原料药等全套附录，关联 469 个知识点

---

<div align="center">

为中国药学教育而生

*Powered by [LangGraph](https://langchain-ai.github.io/langgraph/) · [通义千问](https://qwenlm.github.io/) · [Next.js](https://nextjs.org/)*

</div>
