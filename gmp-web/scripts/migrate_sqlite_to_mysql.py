"""
SQLite → MySQL 数据迁移脚本
─────────────────────────────────────────────────────────
用法：
  1. 在 .env.local 里配置 MYSQL_* 变量（脚本会读取）
  2. 先在 MySQL 里建好库：CREATE DATABASE gmp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  3. 先跑迁移建表：mysql -u root -p gmp < db/migrations-mysql/0000_init_mysql.sql
  4. 跑本脚本：python scripts/migrate_sqlite_to_mysql.py

注意事项：
- 自动处理 SQLite 的 boolean (0/1 整数) → MySQL boolean
- 自动处理 SQLite 的 ISO 字符串时间 → MySQL datetime
- embedding 字段（JSON 序列化 float 数组）原样搬运
- 按 FK 依赖顺序导入，避免外键约束失败
- 用事务 + 批量插入提速（每批 500 行）
"""
import os
import sys
import sqlite3
import re
from pathlib import Path

# 强制 stdout/stderr 用 UTF-8（避免 Windows GBK 报错）
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

try:
    import pymysql
except ImportError:
    print("缺少 pymysql。运行：pip install pymysql")
    sys.exit(1)


# ─── 配置 ──────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
SQLITE_PATH = ROOT / 'gmp.db'

# 读 .env.local
ENV_FILE = ROOT / '.env.local'
env = {}
if ENV_FILE.exists():
    for line in ENV_FILE.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, _, v = line.partition('=')
        env[k.strip()] = v.strip().strip('"').strip("'")

MYSQL_CFG = dict(
    host     = env.get('MYSQL_HOST', os.getenv('MYSQL_HOST', 'localhost')),
    port     = int(env.get('MYSQL_PORT', os.getenv('MYSQL_PORT', '3306'))),
    user     = env.get('MYSQL_USER', os.getenv('MYSQL_USER', 'root')),
    password = env.get('MYSQL_PASSWORD', os.getenv('MYSQL_PASSWORD', '')),
    database = env.get('MYSQL_DATABASE', os.getenv('MYSQL_DATABASE', 'gmp')),
    charset  = 'utf8mb4',
)

# ─── 表导入顺序（按 FK 依赖） ──────────────────────────────────────────────
TABLE_ORDER = [
    # 无依赖
    'users',
    'knowledge_points',
    'reg_library',
    'case_library',
    'questions',
    'skill_library',
    'training_projects',

    # 依赖上面的表
    'kp_dependencies',
    'kp_mastery',
    'kp_reg_links',
    'case_kp_links',
    'skill_reg_links',
    'skill_training_links',
    'skill_kp_links',

    # 用户行为类
    'user_game_state',
    'checkin_log',
    'question_history',
    'learning_plans',
    'simulation_sessions',
    'module_scores',

    # 课程学习模块
    'course_discussions',
    'course_discussion_replies',
    'course_assignments',
    'course_assignment_submissions',
    'course_study_logs',
]

# ─── ISO 时间正则（SQLite 存的是 '2026-05-28T09:00:00' 或 '2026-05-28 09:00:00'） ─
ISO_RE = re.compile(r'^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$')

def normalize_value(col_name: str, val):
    """把 SQLite 值规范成 MySQL 可接受的格式"""
    if val is None:
        return None
    # ISO 时间字符串：把 'T' 换成空格（MySQL 也接受 T，但保险起见）
    if isinstance(val, str) and ISO_RE.match(val):
        return val.replace('T', ' ')
    return val


def get_columns(sqlite_conn, table):
    cur = sqlite_conn.cursor()
    cur.execute(f'PRAGMA table_info({table})')
    return [r[1] for r in cur.fetchall()]


def migrate_table(sqlite_conn, mysql_conn, table, batch_size=500):
    cols = get_columns(sqlite_conn, table)
    if not cols:
        print(f'  [{table}] 跳过：SQLite 中无此表')
        return 0

    cur = sqlite_conn.cursor()
    cur.execute(f'SELECT COUNT(*) FROM {table}')
    total = cur.fetchone()[0]
    if total == 0:
        print(f'  [{table}] 0 行，跳过')
        return 0

    placeholders = ', '.join(['%s'] * len(cols))
    quoted_cols  = ', '.join(f'`{c}`' for c in cols)
    insert_sql = f'INSERT INTO `{table}` ({quoted_cols}) VALUES ({placeholders})'

    mcur = mysql_conn.cursor()
    cur.execute(f'SELECT {quoted_cols} FROM {table}')

    inserted = 0
    batch = []
    while True:
        rows = cur.fetchmany(batch_size)
        if not rows:
            break
        for row in rows:
            batch.append(tuple(normalize_value(c, v) for c, v in zip(cols, row)))
        try:
            mcur.executemany(insert_sql, batch)
            mysql_conn.commit()
            inserted += len(batch)
            print(f'  [{table}] {inserted}/{total}', end='\r')
        except Exception as e:
            mysql_conn.rollback()
            # 批量失败，逐行重试以定位问题
            for r in batch:
                try:
                    mcur.execute(insert_sql, r)
                    mysql_conn.commit()
                    inserted += 1
                except Exception as ee:
                    print(f'\n  [{table}] 单行失败: {ee}\n    数据: {r[:3]}...')
                    mysql_conn.rollback()
        batch = []

    print(f'  [{table}] {inserted}/{total} OK')
    return inserted


def main():
    if not SQLITE_PATH.exists():
        print(f'SQLite 文件不存在：{SQLITE_PATH}')
        sys.exit(1)

    print(f'源 SQLite: {SQLITE_PATH}')
    print(f'目标 MySQL: {MYSQL_CFG["user"]}@{MYSQL_CFG["host"]}:{MYSQL_CFG["port"]}/{MYSQL_CFG["database"]}')
    print()

    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    # WAL checkpoint，保证读到最新数据
    sqlite_conn.execute('PRAGMA wal_checkpoint(TRUNCATE)')

    try:
        mysql_conn = pymysql.connect(**MYSQL_CFG)
    except Exception as e:
        print(f'连接 MySQL 失败：{e}')
        print(f'请确认 MySQL 已启动，且 .env.local 配置正确')
        sys.exit(1)

    print('已连接 MySQL，开始迁移...\n')

    # 关闭外键检查加速（迁移期间）
    mcur = mysql_conn.cursor()
    mcur.execute('SET FOREIGN_KEY_CHECKS = 0')
    mcur.execute('SET UNIQUE_CHECKS = 0')

    grand_total = 0
    for table in TABLE_ORDER:
        n = migrate_table(sqlite_conn, mysql_conn, table)
        grand_total += n

    mcur.execute('SET FOREIGN_KEY_CHECKS = 1')
    mcur.execute('SET UNIQUE_CHECKS = 1')

    print(f'\n迁移完成。总计 {grand_total} 行。\n')

    # 验证：对比关键表行数
    print('行数验证：')
    sql_cur = sqlite_conn.cursor()
    mysql_cur = mysql_conn.cursor()
    fail = 0
    for table in TABLE_ORDER:
        try:
            sql_cur.execute(f'SELECT COUNT(*) FROM {table}')
            src_n = sql_cur.fetchone()[0]
        except sqlite3.OperationalError:
            continue
        try:
            mysql_cur.execute(f'SELECT COUNT(*) FROM `{table}`')
            dst_n = mysql_cur.fetchone()[0]
        except pymysql.err.ProgrammingError:
            print(f'  [{table}] MySQL 中表不存在 FAIL')
            fail += 1
            continue
        mark = 'OK' if src_n == dst_n else 'FAIL'
        if src_n != dst_n: fail += 1
        print(f'  [{table:35s}] SQLite={src_n:6d}  MySQL={dst_n:6d}  {mark}')

    sqlite_conn.close()
    mysql_conn.close()

    if fail:
        print(f'\n{fail} 张表行数不一致，请检查')
        sys.exit(2)
    print('\n所有表行数一致 OK')


if __name__ == '__main__':
    main()
