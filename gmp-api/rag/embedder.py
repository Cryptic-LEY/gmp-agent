"""
批量生成Embedding并写入数据库。
只需运行一次：python -m rag.embedder

策略：
  - 对 reg_library（1361条）取 content 字段
  - 对 knowledge_points（446条）取 title + content 拼接
  - 每批16条调用API，带3秒间隔避免限速
  - 已有embedding的行跳过（支持断点续传）
"""
import json
import sqlite3
import sys
import time

import httpx

sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent.parent))
from config import DB_PATH, EMB_BASE_URL, EMB_API_KEY, EMB_MODEL

BATCH_SIZE = 10
SLEEP_SEC  = 3.0


def embed_batch(texts: list[str]) -> list[list[float]] | None:
    """调用API批量生成embedding，失败返回None。"""
    if not EMB_API_KEY:
        print("⚠ EMB_API_KEY 未设置，跳过embedding生成")
        return None
    try:
        resp = httpx.post(
            f"{EMB_BASE_URL}/embeddings",
            headers={"Authorization": f"Bearer {EMB_API_KEY}"},
            json={"model": EMB_MODEL, "input": texts},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()["data"]
        data.sort(key=lambda x: x["index"])
        return [item["embedding"] for item in data]
    except httpx.HTTPStatusError as e:
        print(f"  API错误 {e.response.status_code}: {e.response.text[:300]}")
        return None
    except Exception as e:
        print(f"  API错误: {e}")
        return None


def run():
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()

    # ── reg_library ──────────────────────────────────────────────────────────
    cur.execute("SELECT reg_id, content FROM reg_library WHERE embedding IS NULL AND content IS NOT NULL")
    reg_rows = cur.fetchall()
    print(f"reg_library 待生成: {len(reg_rows)} 条")

    for i in range(0, len(reg_rows), BATCH_SIZE):
        batch = reg_rows[i:i + BATCH_SIZE]
        texts = [row[1][:500] for row in batch]   # 截断至500字，降低token消耗
        vecs  = embed_batch(texts)
        if vecs is None:
            break
        for (reg_id, _), vec in zip(batch, vecs):
            cur.execute("UPDATE reg_library SET embedding=? WHERE reg_id=?",
                        (json.dumps(vec), reg_id))
        conn.commit()
        done = min(i + BATCH_SIZE, len(reg_rows))
        print(f"  reg_library {done}/{len(reg_rows)}", end='\r')
        if done < len(reg_rows):
            time.sleep(SLEEP_SEC)
    print()

    # ── knowledge_points ─────────────────────────────────────────────────────
    cur.execute("SELECT kp_id, title, content FROM knowledge_points WHERE embedding IS NULL")
    kp_rows = cur.fetchall()
    print(f"knowledge_points 待生成: {len(kp_rows)} 条")

    for i in range(0, len(kp_rows), BATCH_SIZE):
        batch = kp_rows[i:i + BATCH_SIZE]
        texts = [(f"{r[1]} {r[2] or ''}")[:500] for r in batch]
        vecs  = embed_batch(texts)
        if vecs is None:
            break
        for (kp_id, _, __), vec in zip(batch, vecs):
            cur.execute("UPDATE knowledge_points SET embedding=? WHERE kp_id=?",
                        (json.dumps(vec), kp_id))
        conn.commit()
        done = min(i + BATCH_SIZE, len(kp_rows))
        print(f"  knowledge_points {done}/{len(kp_rows)}", end='\r')
        if done < len(kp_rows):
            time.sleep(SLEEP_SEC)
    print()

    # ── case_library ─────────────────────────────────────────────────────────
    try:
        cur.execute(
            "SELECT case_id, product_name, section_name, content "
            "FROM case_library WHERE embedding IS NULL AND content IS NOT NULL"
        )
        case_rows = cur.fetchall()
    except Exception:
        case_rows = []
    print(f"case_library 待生成: {len(case_rows)} 条")

    for i in range(0, len(case_rows), BATCH_SIZE):
        batch = case_rows[i:i + BATCH_SIZE]
        # 文本格式: "产品名 章节名 章节正文" 截断至500字
        texts = [(f"{r[1]} {r[2] or ''} {r[3] or ''}")[:500] for r in batch]
        vecs  = embed_batch(texts)
        if vecs is None:
            break
        for (case_id, *_), vec in zip(batch, vecs):
            cur.execute("UPDATE case_library SET embedding=? WHERE case_id=?",
                        (json.dumps(vec), case_id))
        conn.commit()
        done = min(i + BATCH_SIZE, len(case_rows))
        print(f"  case_library {done}/{len(case_rows)}", end='\r')
        if done < len(case_rows):
            time.sleep(SLEEP_SEC)
    print()

    # 统计
    cur.execute("SELECT COUNT(*) FROM reg_library WHERE embedding IS NOT NULL")
    reg_done = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM knowledge_points WHERE embedding IS NOT NULL")
    kp_done = cur.fetchone()[0]
    try:
        cur.execute("SELECT COUNT(*) FROM case_library WHERE embedding IS NOT NULL")
        case_done = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM case_library")
        case_total = cur.fetchone()[0]
    except Exception:
        case_done = case_total = 0
    conn.close()
    print(f"\nEmbedding生成完成")
    print(f"  reg_library:    {reg_done} 条已有向量")
    print(f"  knowledge_points: {kp_done} 条已有向量")
    print(f"  case_library:   {case_done}/{case_total} 条已有向量")


if __name__ == "__main__":
    run()
