"""
进程内向量索引（01-vector-engine 子任务4，Phase-2 升级为 small-to-big）。

使用 hnswlib HNSW 索引（space='cosine'，M=16，O(log N) 检索）。

Phase 1 建索引时从 reg_library 读（嵌入向量还不存在）；
Phase 2 完成后（reg_chunks 全部嵌入）切到 reg_chunks：
  - 向量来自 small_text（~300字，精准定位）
  - content 返回 big_text（~1800字，充分生成）
  - 多块共享同一 reg_id，search/similarity 按 reg_id 去重取最高分

knowledge_points 不分块，仍从原表读。
"""
from __future__ import annotations

import json
import logging
from collections import defaultdict
from dataclasses import dataclass

import hnswlib
import numpy as np

from config import EMB_DIM

logger = logging.getLogger(__name__)

_NEG_INF = float("-inf")

# HNSW 超参（spec 01-vector-engine.md §4.3）
_HNSW_M               = 16
_HNSW_EF_CONSTRUCTION = 200
_HNSW_EF_SEARCH       = 50
_HNSW_MAX_ELEMENTS    = 100_000  # 初始最大容量，超出时自动 resize


@dataclass
class IndexHit:
    id: str             # reg_id 或 kp_id（对外稳定接口）
    doc_type: str       # 'regulation' | 'kp'
    title: str
    content: str        # big_text（small-to-big 后为大块，否则为原始内容）
    edu_level: str | None
    score: float        # cosine 相似度 [-1, 1]


class VectorIndex:
    def __init__(self, dim: int = EMB_DIM):
        self.dim = dim
        self._index = hnswlib.Index(space="cosine", dim=dim)
        self._index.init_index(
            max_elements=_HNSW_MAX_ELEMENTS,
            M=_HNSW_M,
            ef_construction=_HNSW_EF_CONSTRUCTION,
            random_seed=42,
        )
        self._index.set_ef(_HNSW_EF_SEARCH)
        self._records: list[dict] = []           # label i → 记录（不含 vec）
        self._vecs: list[np.ndarray] = []        # label i → 归一化向量，供 similarity() 点积
        self._chunk_id_to_label: dict[str, int] = {}   # chunk_id → label
        # reg_id → [chunk_id, ...]，用于 similarity 多块取最高分
        self._reg_to_chunks: dict[str, list[str]] = defaultdict(list)

    @property
    def size(self) -> int:
        return self._index.get_current_count()

    def add_items(self, records: list[dict]) -> None:
        """
        records: [{id, doc_type, title, content, edu_level, vec, reg_id?}, ...]
        id      = chunk 的内部唯一键（chunk_id 字符串，或 kp_id）
        reg_id  = 对外暴露的文档标识（省略时退化为 id）
        title   = 同一 reg_id 的所有 chunks 共享相同的 article_num，
                  search 中取最高分 chunk 的 title 结果稳定
        """
        if not records:
            return
        vecs = np.asarray([r["vec"] for r in records], dtype="float32")
        # 归一化存储：hnswlib cosine 空间内部也会归一化，另存一份用于 similarity() 点积
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        vecs_norm = vecs / norms

        base = len(self._records)
        needed = base + len(records)
        if needed > self._index.max_elements:
            self._index.resize_index(max(needed * 2, _HNSW_MAX_ELEMENTS))

        labels = np.arange(base, base + len(records), dtype=np.uint64)
        self._index.add_items(vecs_norm, labels)

        for j, r in enumerate(records):
            chunk_id = str(r["id"])
            reg_id   = str(r.get("reg_id") or r["id"])
            lbl = base + j
            self._records.append({k: v for k, v in r.items() if k != "vec"})
            self._vecs.append(vecs_norm[j])
            self._chunk_id_to_label[chunk_id] = lbl
            self._reg_to_chunks[reg_id].append(chunk_id)

    def get_record(self, id_: str) -> dict | None:
        """
        按 chunk_id 或 reg_id 取记录。
        Phase-1：id_ == chunk_id == reg_id，直接命中。
        Phase-2：id_ 可能是 reg_id（BM25/图扩展场景），fallback 取该 reg_id 首块。
        """
        lbl = self._chunk_id_to_label.get(id_)
        if lbl is not None:
            return self._records[lbl]
        chunk_ids = self._reg_to_chunks.get(id_, [])
        if chunk_ids:
            lbl = self._chunk_id_to_label.get(chunk_ids[0])
            return self._records[lbl] if lbl is not None else None
        return None

    def get_best_record(self, id_: str, query_vec: list[float] | None) -> dict | None:
        """
        按 reg_id 取相似度最高的块记录（Phase-2 修正：BM25/图扩展场景）。
        vector search 已在 search() 中按 reg_id 去重取最高分，无需此方法；
        BM25 和图扩展用 reg_id 查 big_text 时，必须选最相关块而非首块。
        query_vec 为 None 时退化为 get_record（取首块）。
        """
        if query_vec is None:
            return self.get_record(id_)

        # chunk_id 直接命中（无需按 reg_id 选最优块）
        lbl = self._chunk_id_to_label.get(id_)
        if lbl is not None:
            return self._records[lbl]

        # reg_id → 遍历所有块，取点积最高的块
        chunk_ids = self._reg_to_chunks.get(id_, [])
        if not chunk_ids:
            return None

        q = np.asarray(query_vec, dtype="float32")
        norm = np.linalg.norm(q)
        if norm > 0:
            q = q / norm

        best_lbl: int | None = None
        best_score = float("-inf")
        for cid in chunk_ids:
            lbl = self._chunk_id_to_label.get(cid)
            if lbl is None:
                continue
            score = float(np.dot(q, self._vecs[lbl]))
            if score > best_score:
                best_score = score
                best_lbl = lbl

        return self._records[best_lbl] if best_lbl is not None else None

    def similarity(self, query_vec, ids: list[str]) -> dict[str, float]:
        """
        给定一批 reg_id，返回与 query 的最高 cosine（多块取最大）。
        ids 可以是 reg_id 或 kp_id（两者都在 _reg_to_chunks 里）。
        cosine 值域 [-1, 1]；初始值用 -inf 确保负相关分数也能被正确记录。
        """
        if not ids:
            return {}
        q = np.asarray(query_vec, dtype="float32")
        norm = np.linalg.norm(q)
        if norm > 0:
            q = q / norm
        out: dict[str, float] = {}
        for reg_id in ids:
            chunk_ids = self._reg_to_chunks.get(reg_id, [])
            best = _NEG_INF
            for cid in chunk_ids:
                lbl = self._chunk_id_to_label.get(cid)
                if lbl is None:
                    continue
                score = float(np.dot(q, self._vecs[lbl]))
                if score > best:
                    best = score
            if chunk_ids and best > _NEG_INF:
                out[reg_id] = best
        return out

    def search(self, query_vec, k: int = 10, edu_level: str | None = None) -> list[IndexHit]:
        """
        向量检索，按 reg_id 去重（多块取最高分），edu_level 后过滤。
        返回按 score 降序的 IndexHit 列表（id = reg_id）。
        fetch = k * 16：多取候选以应对高密度分块的同 reg_id 去重损耗。
        hnswlib cosine 距离 = 1 - cosine_similarity，故 score = 1 - distance。
        """
        if self.size == 0:
            return []
        q = np.asarray([query_vec], dtype="float32")
        norm = np.linalg.norm(q)
        if norm > 0:
            q = q / norm
        fetch = min(k * 16, self.size)
        # knn_query 返回 (labels, distances)；cosine space distance = 1 - cos_sim
        labels, distances = self._index.knn_query(q, k=fetch)

        seen_reg: dict[str, IndexHit] = {}
        for lbl, dist in zip(labels[0], distances[0]):
            score  = 1.0 - float(dist)
            rec    = self._records[int(lbl)]
            reg_id = str(rec.get("reg_id") or rec["id"])
            if edu_level and rec.get("edu_level") and rec["edu_level"] != edu_level:
                continue
            if reg_id not in seen_reg or score > seen_reg[reg_id].score:
                seen_reg[reg_id] = IndexHit(
                    id=reg_id, doc_type=rec["doc_type"], title=rec["title"],
                    content=rec["content"], edu_level=rec.get("edu_level"),
                    score=score,
                )

        hits = sorted(seen_reg.values(), key=lambda h: h.score, reverse=True)[:k]
        return hits


def build_index(conn) -> VectorIndex:
    """
    从 MySQL 构建索引。
    reg_chunks 有向量时使用（small-to-big，big_text 作为 content）；
    否则回退到 reg_library（兼容 Phase 1，会打 WARNING）。
    knowledge_points 始终从原表读。
    """
    idx = VectorIndex()
    cur = conn.cursor()
    records: list[dict] = []

    # ── 法规：优先从 reg_chunks 读（small-to-big） ──────────────────────────────
    cur.execute("SELECT COUNT(*) FROM reg_chunks WHERE embedding IS NOT NULL")
    chunks_ready = cur.fetchone()[0] > 0

    if chunks_ready:
        cur.execute("""
            SELECT chunk_id, reg_id, big_text, embedding, meta
            FROM reg_chunks
            WHERE embedding IS NOT NULL
        """)
        for chunk_id, reg_id, big_text, emb_json, meta_json in cur.fetchall():
            try:
                vec = json.loads(emb_json)
            except (json.JSONDecodeError, TypeError):
                continue
            meta = {}
            try:
                meta = json.loads(meta_json) if meta_json else {}
            except (json.JSONDecodeError, TypeError):
                pass
            records.append({
                "id":        str(chunk_id),
                "reg_id":    str(reg_id),           # M3: 显式转 str 防类型不一致
                "doc_type":  meta.get("doc_type", "regulation"),
                "title":     meta.get("article_num", ""),
                "content":   big_text or "",
                "edu_level": meta.get("edu_level"),
                "vec":       vec,
            })
    else:
        # Phase 1 fallback：reg_chunks 还没向量，用 reg_library
        logger.warning("reg_chunks 无嵌入向量，回退 Phase-1 路径（reg_library）")
        cur.execute("SELECT reg_id, article_num, content, embedding FROM reg_library WHERE embedding IS NOT NULL")
        for reg_id, article_num, content, emb_json in cur.fetchall():
            try:
                vec = json.loads(emb_json)
            except (json.JSONDecodeError, TypeError):
                continue
            records.append({
                "id":        str(reg_id),           # M3: 显式转 str
                "doc_type":  "regulation",
                "title":     article_num or "",
                "content":   content or "",
                "edu_level": None,
                "vec":       vec,
            })

    # ── 知识点（无分块，从原表读） ───────────────────────────────────────────────
    cur.execute("SELECT kp_id, title, content, embedding, edu_level FROM knowledge_points WHERE embedding IS NOT NULL")
    for kp_id, title, content, emb_json, edu in cur.fetchall():
        try:
            vec = json.loads(emb_json)
        except (json.JSONDecodeError, TypeError):
            continue
        records.append({
            "id":        str(kp_id),
            "doc_type":  "kp",
            "title":     title or "",
            "content":   content or "",
            "edu_level": edu or None,
            "vec":       vec,
        })

    idx.add_items(records)

    # ── 经验回流：把持久化的好 case 灌回索引（跨进程/重建不丢失，spec C6） ──────────
    try:
        from memory.experience import load_experiences
        n_exp = load_experiences(idx)
        if n_exp:
            logger.info("经验回流：从 experience_pool 加载 %d 条", n_exp)
    except Exception as exc:  # noqa: BLE001
        logger.warning("经验回流加载失败（降级，不影响主索引）：%s", exc)

    return idx


# ── 进程内单例 ─────────────────────────────────────────────────────────────────
_index: VectorIndex | None = None


def get_index() -> VectorIndex | None:
    return _index


def rebuild() -> VectorIndex:
    """从 MySQL 重建单例索引（启动时 / 重嵌入后调用）。
    CPython GIL 保证 `_index = build_index(conn)` 赋值原子；多线程并发读取旧索引安全。
    重建后同步清空语义缓存（B6：一致性保证）。
    """
    global _index
    from rag.retriever import _get_conn
    with _get_conn() as conn:
        _index = build_index(conn)

    # 缓存失效：索引更新后旧缓存条目可能基于过时向量检索结果
    try:
        from cache.semantic_cache import get_cache
        get_cache().invalidate()
    except Exception:
        pass  # cache 模块不可用时静默降级，不影响主流程

    return _index
