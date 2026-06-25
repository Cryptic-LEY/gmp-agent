# SQLite 迁移到 MySQL

当前项目运行时仍然使用 `better-sqlite3` 和 `drizzle-orm/better-sqlite3`。这里先提供可执行的数据迁移工具，把本地 SQLite 的业务数据迁入 MySQL；下一步再切运行时代码到 MySQL。

## 1. 准备 MySQL 数据库

建议使用 MySQL 8.x，并创建 `utf8mb4` 数据库：

```sql
CREATE DATABASE gmp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

PowerShell 示例：

```powershell
$env:MYSQL_URL="mysql://root:password@127.0.0.1:3306/gmp"
```

如果 SQLite 文件不是默认位置，再指定：

```powershell
$env:SQLITE_DB_PATH="D:\project\gmp\gmp-custodian-master\gmp-custodian-master\gmp.db\gmp.db"
```

## 2. 建 MySQL 表

```powershell
npm run db:mysql:schema
```

这会执行 `db/mysql-schema.sql`，创建与当前 SQLite 业务表对应的 MySQL 表。SQLite 的 `reg_fts*` FTS5 虚拟表不会迁移；MySQL 侧使用 `reg_library.content` 和 `case_library.content` 的 `FULLTEXT` 索引替代。

## 3. 迁移数据

首次迁移到空库：

```powershell
npm run db:mysql:migrate
```

如果目标 MySQL 已经有旧数据，确认可清空后再执行：

```powershell
npm run db:mysql:migrate -- --truncate
```

只迁移部分表：

```powershell
npm run db:mysql:migrate -- --tables=users,knowledge_points,questions
```

## 4. 切换运行时代码

迁移数据完成后，应用还不能自动读 MySQL。需要继续做这些代码改造：

1. 把 `db/schema.ts` 从 `drizzle-orm/sqlite-core` 改成 `drizzle-orm/mysql-core`。
2. 把 `db/index.ts` 从 `better-sqlite3` 改成 `mysql2/promise` + `drizzle-orm/mysql2`。
3. 把所有 `db.$client.prepare(...)` 和 SQLite 方言 SQL 改成 Drizzle 查询或 MySQL SQL。
4. 把 `datetime('now')`、`INSERT OR IGNORE`、`ON CONFLICT`、`sqlite_master`、`ORDER BY RANDOM()` 改成 MySQL 写法。
5. 替换 `scripts/seed-admin.js`，让管理员初始化脚本写 MySQL。

目前已定位到这些重点接口：`app/api/admin/system/route.ts`、`app/api/admin/schools/route.ts`、`app/api/graph/route.ts`、`app/api/onboarding/submit/route.ts`、`app/api/simulation/*`、`app/api/report/summary/route.ts`、`app/api/user/mastery/route.ts`。
