# Team Sync Server

实训仿真组队战斗的高频同步使用独立 Socket.IO 服务，不再通过 Next API 路由每 150ms 读写数据库。

## 架构

1. 客户端进入组队战斗后读取 `NEXT_PUBLIC_TEAM_SYNC_URL`，连接 `team-sync-server`。
2. Socket.IO handshake 携带 `token` 和 `roomId`。
3. 服务端校验 JWT，并检查用户属于 `started` 状态的房间。
4. 玩家移动、攻击、血量等高频状态写入 Redis Hash：`team-sync:room:{roomId}:players`。
5. 题目、复活、房间世界状态等可靠事件写入 Redis：`team-sync:room:{roomId}:world`。
6. Socket.IO Redis adapter 负责多进程广播。
7. 服务端每 1 秒把 Redis 最新状态批量刷入 MySQL。
8. `/api/team/play-state` 保留，客户端会用它做首次兜底、断线重连和房间结束状态检测。

## 环境变量

```env
MYSQL_URL=mysql://root:password@127.0.0.1:3306/gmp
JWT_SECRET=gmp-dev-secret-change-me
REDIS_URL=redis://127.0.0.1:6379

TEAM_SYNC_HOST=0.0.0.0
TEAM_SYNC_PORT=3011
TEAM_SYNC_CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000,http://192.168.1.161:3000

NEXT_PUBLIC_TEAM_SYNC_URL=http://127.0.0.1:3011
```

## 启动

```bash
npm run team-sync
```

如果未配置 `NEXT_PUBLIC_TEAM_SYNC_URL`，或实时服务连接失败，客户端会自动退回 `/api/team/play-state`。
