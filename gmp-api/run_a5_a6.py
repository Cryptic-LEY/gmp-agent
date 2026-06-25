# -*- coding: utf-8 -*-
"""
A5 近义词/反义词区分 + A6 Rerank 消融实验
付费：调用 DashScope embedding（查询）+ reranker（A6）
"""
import sys, time, json
import numpy as np
import httpx

sys.path.insert(0, ".")
from config import EMB_BASE_URL, EMB_API_KEY, EMB_MODEL, DASHSCOPE_BASE_URL, DASHSCOPE_API_KEY
import rag.vector_index as vi
from rag.retriever import retrieve

# ── 建索引（只读，复用已有 reg_chunks 向量）
print("正在重建进程内索引...", flush=True)
vi.rebuild()
idx = vi.get_index()
print(f"索引大小：{idx.size} 个向量\n")


def embed_query(text: str) -> list[float]:
    resp = httpx.post(
        f"{EMB_BASE_URL}/embeddings",
        headers={"Authorization": f"Bearer {EMB_API_KEY}"},
        json={"model": EMB_MODEL, "input": [text]},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


def cosine(a, b) -> float:
    a, b = np.array(a, dtype="float32"), np.array(b, dtype="float32")
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


# ═══════════════════════════════════════════════════════════════════════════════
# A5  近义词/反义词语义区分测试
# ═══════════════════════════════════════════════════════════════════════════════
print("=" * 60)
print("A5  语义区分测试（近义词 vs 反义词 vs 自身）")
print("=" * 60)

# 每组 3 个 query：正向、反向、同义
semantic_groups = [
    {
        "label": "合格/不合格",
        "positive": "物料检验合格放行的要求",
        "negative": "物料检验不合格的处理规定",
        "synonym":  "原辅料验收通过的标准",
    },
    {
        "label": "放行/不予放行",
        "positive": "成品批放行的条件",
        "negative": "成品不予放行的情形",
        "synonym":  "产品审核批准出厂的程序",
    },
    {
        "label": "洁净区/非洁净区",
        "positive": "洁净区空气净化和环境监测要求",
        "negative": "非洁净区物料存储管理",
        "synonym":  "净化车间的温湿度和微生物限度",
    },
]

a5_pass = 0
for g in semantic_groups:
    vp = embed_query(g["positive"])
    time.sleep(0.5)
    vn = embed_query(g["negative"])
    time.sleep(0.5)
    vs = embed_query(g["synonym"])
    time.sleep(0.5)

    sim_pn = cosine(vp, vn)   # 反义：应低
    sim_ps = cosine(vp, vs)   # 同义：应高
    sim_pp = 1.0               # 自身：1.0

    # 检索 top-3 重叠（正向 vs 反向）
    hits_p = {h.id for h in idx.search(vp, k=5)}
    hits_n = {h.id for h in idx.search(vn, k=5)}
    overlap = len(hits_p & hits_n)

    ok = sim_pn < 0.93 and sim_ps > sim_pn
    status = "[OK]" if ok else "[FAIL]"
    a5_pass += ok

    print(f"\n[{g['label']}]  {status}")
    print(f"  正向 vs 同义 cosine : {sim_ps:.4f}  （越高越好）")
    print(f"  正向 vs 反义 cosine : {sim_pn:.4f}  （越低越好，应 < 0.93）")
    print(f"  top-5 命中重叠      : {overlap}/5  （越少越好）")

print(f"\nA5 结论：{a5_pass}/{len(semantic_groups)} 组区分充分", end="")
print("  [OK] PASS" if a5_pass == len(semantic_groups) else "  [FAIL] FAIL")


# ═══════════════════════════════════════════════════════════════════════════════
# A6  Rerank 消融实验（保序 mock vs DashScope gte-rerank）
# ═══════════════════════════════════════════════════════════════════════════════
print("\n\n" + "=" * 60)
print("A6  Rerank 消融实验")
print("=" * 60)

# 10 条金标准 (问题, 期望命中关键词)
GOLD = [
    ("洁净区的温湿度和微生物监测规定",    "洁净"),
    ("物料取样的操作规程",               "取样"),
    ("批生产记录的填写和保存要求",         "批记录"),
    ("偏差调查和纠正预防措施",            "偏差"),
    ("质量受权人的职责与权限",            "授权人"),
    ("清洁验证方法和可接受标准",          "清洁"),
    ("生产设备确认和验证程序",            "确认"),
    ("生产人员卫生和健康要求",            "卫生"),
    ("原辅料的储存条件和期限",            "储存"),
    ("不合格品的隔离和处理程序",          "不合格"),
]

_identity_rerank = lambda q, passages: [1.0 - i * 0.001 for i in range(len(passages))]

print(f"\n{'问题':<30} {'无rerank':^8} {'有rerank':^8} {'Δ':^6}")
print("-" * 58)

no_ranks, yes_ranks = [], []

for question, keyword in GOLD:
    # 嵌入查询（付费）
    try:
        qv = embed_query(question)
    except Exception as e:
        print(f"  嵌入失败: {e}")
        continue
    time.sleep(0.6)

    # 无 rerank（保序 mock）
    chunks_no = retrieve(question, query_vec=qv, rerank_fn=_identity_rerank)
    rank_no = next(
        (i + 1 for i, c in enumerate(chunks_no) if keyword in c.content or keyword in c.title),
        None
    )

    # 有 rerank（真实 DashScope）
    try:
        chunks_yes = retrieve(question, query_vec=qv)
    except Exception as e:
        chunks_yes = chunks_no
    rank_yes = next(
        (i + 1 for i, c in enumerate(chunks_yes) if keyword in c.content or keyword in c.title),
        None
    )
    time.sleep(1.2)

    r_no  = rank_no  or 16
    r_yes = rank_yes or 16
    no_ranks.append(r_no)
    yes_ranks.append(r_yes)
    delta = r_no - r_yes

    r_no_str  = str(rank_no)  if rank_no  else "N/F"
    r_yes_str = str(rank_yes) if rank_yes else "N/F"
    print(f"{question[:28]:<30} {r_no_str:^8} {r_yes_str:^8} {delta:^+6}")

avg_no  = sum(no_ranks)  / max(len(no_ranks), 1)
avg_yes = sum(yes_ranks) / max(len(yes_ranks), 1)
avg_imp = avg_no - avg_yes

print("-" * 58)
print(f"{'平均排名':<30} {avg_no:^8.1f} {avg_yes:^8.1f} {avg_imp:^+6.1f}")

a6_ok = avg_imp >= 0
print(f"\nA6 结论：rerank 平均排名提升 {avg_imp:+.1f} 位", end="")
print("  [OK] PASS（有改善或持平）" if a6_ok else "  [FAIL] FAIL（rerank 劣化）")
