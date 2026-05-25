# -*- coding: utf-8 -*-
import sqlite3

conn = sqlite3.connect('gmp.db')
cur = conn.cursor()

print('=== 抽样检查 ===')
rows = cur.execute("""
  SELECT reg_id, doc_type, appendix_name, article_num, substr(content,1,50)
  FROM reg_library
  WHERE reg_id IN ('REG-GMP2010-A001','REG-APP-WJ-001','REG-PHL-001','REG-DRM-001')
""").fetchall()
for r in rows:
    print(r)

print('\n=== 所有表行数 ===')
tables = cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
for (t,) in tables:
    cnt = cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
    print(f'  {t}: {cnt} rows')

conn.close()
