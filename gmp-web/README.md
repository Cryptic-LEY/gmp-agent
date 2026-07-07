# GMP Web

`gmp-web` 是 GMP 助学平台的 Next.js 主应用，包含学生端、教师端、管理员端、课程学习、AI 助学、OpenMAIC 接入、实训仿真游戏、团队协作和 API Routes。

## 技术栈

- Next.js 16
- React 19
- TypeScript
- Drizzle ORM
- MySQL
- Socket.IO
- Redis
- Three.js / React Three Fiber

## 目录说明

```text
gmp-web/
├─ app/                  # App Router 页面和 API Routes
├─ db/                   # 数据库 schema 与连接
├─ docs/                 # 项目文档
├─ lib/                  # 业务逻辑、工具函数和协作服务
├─ public/               # 静态资源，包含课程、仿真、音频、角色素材
├─ scripts/              # 数据库和资源处理脚本
├─ team-sync-server/     # 团队实训 Socket.IO 同步服务
├─ package.json
└─ README.md
```

## 环境变量

新建 `.env.local`：

```env
MYSQL_URL=mysql://root:password@127.0.0.1:3306/gmp
JWT_SECRET=gmp-dev-secret-change-me

OPENMAIC_URL=http://localhost:3002

OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=alloy

DASHSCOPE_API_KEY=
DASHSCOPE_TTS_MODEL=
DASHSCOPE_TTS_VOICE=

REDIS_URL=redis://127.0.0.1:6379
NEXT_PUBLIC_TEAM_SYNC_URL=http://127.0.0.1:3011
```

`.env.local` 包含本地密钥和数据库信息，不要提交到仓库。

## 安装与启动

安装依赖：

```bash
npm install
```

启动开发服务：

```bash
npm run dev
```

访问地址：

```text
http://localhost:3000
```

生产构建：

```bash
npm run build
```

生产启动：

```bash
npm run start -- --port 3000
```

## 数据库

执行 MySQL 迁移：

```bash
npm run db:mysql:migrate
```

创建默认管理员：

```bash
npm run db:seed-admin
```

默认账号：

```text
邮箱：admin@gmp.local
密码：Admin@123456
```

## 团队实时同步

启动 Socket.IO 同步服务：

```bash
npm run team-sync
```

默认端口：

```text
http://127.0.0.1:3011
```

服务依赖：

- `MYSQL_URL`
- `JWT_SECRET`
- `REDIS_URL`
- `TEAM_SYNC_PORT`
- `TEAM_SYNC_CORS_ORIGIN`

客户端通过 `NEXT_PUBLIC_TEAM_SYNC_URL` 连接实时服务；连接失败时会回退到 `/api/team/play-state`。

## 实训仿真资源

仿真模块资源位于：

```text
public/simulation/
```

当前包含：

- 1-6 章场景资源
- 玩家角色模型与动作帧
- 小怪与 boss1-boss6
- 门、地图、道具和音效
- AI 语音与战斗音效资源

新增或替换资源后建议执行：

```bash
npm run build
```

确认 TypeScript、资源路径和静态构建均正常。
