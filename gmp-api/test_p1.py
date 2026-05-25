# -*- coding: utf-8 -*-
"""P1 改进效果验证测试"""
import sys, re
sys.stdout.reconfigure(encoding='utf-8')

from rag.retriever import retrieve, _bm25_search, _ensure_fts
from agents.tutor import _check_hallucinated_articles
import sqlite3
from config import DB_PATH

PASS = '✓'
FAIL = '✗'

def check(label, cond, detail=''):
    status = PASS if cond else FAIL
    print(f'  [{status}] {label}' + (f'  → {detail}' if detail else ''))
    return cond

results = []

# ═══════════════════════════════════════════════════════════════
print('\n' + '='*60)
print('P1-1  BM25 混合检索')
print('='*60)

# 测试1a: FTS索引是否建立
conn = sqlite3.connect(DB_PATH)
_ensure_fts(conn)
fts_count = conn.execute('SELECT COUNT(*) FROM reg_fts').fetchone()[0]
lib_count = conn.execute('SELECT COUNT(*) FROM reg_library').fetchone()[0]
conn.close()
results.append(check('FTS索引行数与reg_library一致', fts_count == lib_count,
                     f'FTS={fts_count} / lib={lib_count}'))

# 测试1b: BM25能找到精确条款号
conn = sqlite3.connect(DB_PATH)
_ensure_fts(conn)
bm25_hits = _bm25_search(conn, '第十条', RAG_TOP_K := 10)
conn.close()
results.append(check('BM25搜索"第十条"有结果', len(bm25_hits) > 0,
                     f'命中{len(bm25_hits)}条: {bm25_hits[:3]}'))

# 测试1c: 精确条款查询——向量可能弱，BM25应补充
docs_exact = retrieve('第十条规定了什么要求')
reg_ids = [d.id for d in docs_exact if d.doc_type == 'regulation']
# 条款编号存储在 article_num 字段（"十"），不在 content 里；验证是否召回第十条
conn = sqlite3.connect(DB_PATH)
content_check = conn.execute(
    f"SELECT COUNT(*) FROM reg_library WHERE reg_id IN ({','.join('?'*len(reg_ids))}) AND article_num IN ('十','10')",
    reg_ids
).fetchone()[0] if reg_ids else 0
conn.close()
results.append(check('精确条款查询召回第十条(article_num=十或10)', content_check > 0,
                     f'召回第十条条款: {content_check}条'))

# 测试1d: 新增文件（受托生产公告）能被向量+BM25联合召回
docs_com = retrieve('受托生产企业应当建立健全质量管理体系')
com_ids = [d.id for d in docs_com if 'REG-COM' in d.id]
results.append(check('受托生产公告(REG-COM)被召回', len(com_ids) > 0,
                     f'召回REG-COM条款: {com_ids[:3]}'))

# 测试1e: 制药用水新文件
docs_pwg = retrieve('制药用水的检查要点和质量风险管理')
pwg_ids = [d.id for d in docs_pwg if 'REG-PWG' in d.id]
results.append(check('制药用水检查指南(REG-PWG)被召回', len(pwg_ids) > 0,
                     f'召回REG-PWG条款: {pwg_ids[:3]}'))

# ═══════════════════════════════════════════════════════════════
print('\n' + '='*60)
print('P1-3  edu_level 学历过滤')
print('='*60)

q = '洁净区环境监测的要求'

docs_zj = retrieve(q, edu_level='专科')
docs_bk = retrieve(q, edu_level='本科')
docs_all = retrieve(q)

kp_zj  = [d for d in docs_zj  if d.doc_type == 'kp']
kp_bk  = [d for d in docs_bk  if d.doc_type == 'kp']
kp_all = [d for d in docs_all if d.doc_type == 'kp']

# 专科结果里不应含BK
no_bk_in_zj = all('BK' not in d.id for d in kp_zj)
results.append(check('专科查询结果不含本科KP', no_bk_in_zj,
                     f'专科KP={len(kp_zj)}条，含BK={sum(1 for d in kp_zj if "BK" in d.id)}条'))

# 本科结果里不应含ZJ
no_zj_in_bk = all('ZJ' not in d.id for d in kp_bk)
results.append(check('本科查询结果不含专科KP', no_zj_in_bk,
                     f'本科KP={len(kp_bk)}条，含ZJ={sum(1 for d in kp_bk if "ZJ" in d.id)}条'))

# 不指定层级时两者都有
has_both = any('ZJ' in d.id for d in kp_all) and any('BK' in d.id for d in kp_all)
results.append(check('不指定edu_level时专科本科KP均可出现', has_both,
                     f'ZJ={sum(1 for d in kp_all if "ZJ" in d.id)}条 BK={sum(1 for d in kp_all if "BK" in d.id)}条'))

# 法规条款不受edu_level影响（都应被召回）
reg_zj  = len([d for d in docs_zj  if d.doc_type == 'regulation'])
reg_bk  = len([d for d in docs_bk  if d.doc_type == 'regulation'])
results.append(check('法规条款不受edu_level过滤影响', reg_zj > 0 and reg_bk > 0,
                     f'专科法规={reg_zj}条 本科法规={reg_bk}条'))

# ═══════════════════════════════════════════════════════════════
print('\n' + '='*60)
print('P1-5  条款编号幻觉检测')
print('='*60)

# 构造检索结果集（模拟真实召回的ID）
real_ids = {'REG-GMP2010-A010', 'REG-GMP2010-A011', 'REG-COM-001', 'REG-PWG-003'}

# 测试5a: 答案含虚构REG-ID → 应检出
fake_draft = '根据REG-GMP2010-A999的规定，洁净区必须保持正压，同时REG-FAKE-XXX-001也要求...'
issue_fake = _check_hallucinated_articles(fake_draft, real_ids)
results.append(check('虚构条款编号被检出', bool(issue_fake),
                     f'检出: {issue_fake[:60]}' if issue_fake else '未检出'))

# 测试5b: 答案只含真实REG-ID → 应通过
real_draft = '根据REG-GMP2010-A010的规定，质量管理部门应当负责药品放行。REG-COM-001要求建立质量管理体系。'
issue_real = _check_hallucinated_articles(real_draft, real_ids)
results.append(check('真实条款编号不误报', not bool(issue_real),
                     f'误报: {issue_real}' if issue_real else '无误报'))

# 测试5c: 答案不含任何REG-ID → 应通过（不误报）
plain_draft = '洁净区环境监测需要定期进行悬浮粒子和微生物监测，确保符合GMP要求。'
issue_plain = _check_hallucinated_articles(plain_draft, real_ids)
results.append(check('不含REG-ID的答案不触发检测', not bool(issue_plain),
                     f'误报: {issue_plain}' if issue_plain else '无误报'))

# 测试5d: 混合情况——真实+虚构混用
mixed_draft = 'REG-GMP2010-A010规定了质量管理部门职责，REG-GMP2010-A999规定了...'
issue_mixed = _check_hallucinated_articles(mixed_draft, real_ids)
hallucinated = re.findall(r'REG-[A-Z0-9]+-[A-Z0-9]+-\d+', issue_mixed) if issue_mixed else []
results.append(check('混合引用中仅虚构部分被检出', 'REG-GMP2010-A999' in issue_mixed and 'REG-GMP2010-A010' not in issue_mixed,
                     f'检出: {hallucinated}'))

# ═══════════════════════════════════════════════════════════════
print('\n' + '='*60)
passed = sum(results)
total  = len(results)
print(f'测试结果: {passed}/{total} 通过')
print('='*60)
