# GMP 助学平台 — 本地启动指南

## 目录结构

```
gmp-agent/
├── gmp-web/          # Next.js 前端（端口 3000）
├── gmp-api/          # FastAPI 后端（端口 8001）
├── build_*.py        # 数据库构建脚本（已构建好，无需再跑）
└── SETUP.md          # 本文件
```

---

## 前提：需要单独获取的文件

> **`gmp-web/gmp.db`（58MB）不在 git 仓库里，需要向项目负责人单独索取。**

拿到后放到 `gmp-web/gmp.db`（路径要对，gmp-api 也从这里读数据）。

---

## 一、启动前端（gmp-web）

### 1. 安装依赖
```bash
cd gmp-web
npm install
```

### 2. 配置环境变量
```bash
# 复制示例文件
cp .env.local.example .env.local
```

打开 `.env.local`，填入：
```
JWT_SECRET=随便填一个长字符串，用于签发登录token
OPENMAIC_URL=http://localhost:3002
```

### 3. 初始化数据库表结构（首次或有新迁移时）
```bash
npx tsx db/migrate.ts
```

### 4. 启动开发服务器
```bash
npm run dev
```

浏览器打开 http://localhost:3000

---

## 二、启动后端（gmp-api）

### 1. 创建 Python 虚拟环境（推荐）
```bash
cd gmp-api
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate
```

### 2. 安装依赖
```bash
pip install -r requirements.txt
```

### 3. 配置环境变量
```bash
cp .env.example .env
```

打开 `.env`，填入：
```
DASHSCOPE_API_KEY=sk-你的通义千问APIKey
```

> 通义千问 API Key 从 https://dashscope.aliyuncs.com/ 获取（免费额度够用）

### 4. 启动服务
```bash
uvicorn main:app --reload --port 8001
```

---

## 三、验证启动成功

| 服务 | 地址 | 预期 |
|------|------|------|
| 前端 | http://localhost:3000 | 显示登录页 |
| 后端 API 文档 | http://localhost:8001/docs | 显示 FastAPI Swagger UI |

注册账号 → 完成前测 → 进入 Dashboard，若三个区域（图谱/练习/成绩）均正常加载则说明配置成功。

---

## 常见问题

**Q: `npm run dev` 报数据库错误？**  
A: 检查 `gmp-web/gmp.db` 是否存在，然后重跑 `npx tsx db/migrate.ts`

**Q: 前端问 AI 没有回答？**  
A: 确认 gmp-api 在 8001 端口运行，且 `.env` 里 DASHSCOPE_API_KEY 填的是真实 Key

**Q: Python 版本？**  
A: 需要 Python 3.11+（`python --version` 检查）
