import sys, sqlite3
sys.stdout.reconfigure(encoding='utf-8')
import pymysql

sc = sqlite3.connect('gmp.db')
sc.execute('PRAGMA wal_checkpoint(TRUNCATE)')
mc = pymysql.connect(host='localhost', port=3306, user='root', password='',
                     database='gmp', charset='utf8mb4')

scur = sc.cursor(); mcur = mc.cursor()
tables = ['users','knowledge_points','reg_library','case_library','questions',
          'skill_library','training_projects','kp_mastery','kp_reg_links',
          'skill_reg_links','skill_training_links','skill_kp_links',
          'user_game_state','checkin_log','question_history','learning_plans',
          'simulation_sessions','module_scores']
fail = 0
for t in tables:
    scur.execute(f'SELECT COUNT(*) FROM {t}'); s = scur.fetchone()[0]
    mcur.execute(f'SELECT COUNT(*) FROM `{t}`'); m = mcur.fetchone()[0]
    mark = 'OK' if s == m else 'FAIL'
    if s != m: fail += 1
    print(f'{t:30s}  SQLite={s:6d}  MySQL={m:6d}  {mark}')

print(f'\nTotal mismatches: {fail}')
