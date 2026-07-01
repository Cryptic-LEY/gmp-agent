# -*- coding: utf-8 -*-
"""
01-vector-engine 子任务4：进程内 hnswlib HNSW 向量索引单测。

合成向量测索引逻辑（零成本）；build_index 读真库（只读，免费）验证真实数据可检索，
并证明已消灭「每请求全量加载 + Python 逐条 cosine」反模式（索引一次性构建、查询走 HNSW）。
"""
import json
from pathlib import Path

import pytest

from rag.vector_index import VectorIndex, build_index
from rag.retriever import _get_conn


def _rec(id, vec, doc_type="regulation", title="", content="", edu_level=None):
    return {"id": id, "doc_type": doc_type, "title": title,
            "content": content, "edu_level": edu_level, "vec": vec}


def test_hnswlib_not_faiss_in_source():
    """验证 vector_index.py 使用 hnswlib 而非 faiss（P1 验收核心项）。"""
    src = (Path(__file__).parent / "rag" / "vector_index.py").read_text(encoding="utf-8")
    assert "import hnswlib" in src, "vector_index.py 未导入 hnswlib"
    assert "import faiss" not in src, "vector_index.py 仍含 faiss 导入"


def test_search_returns_nearest_by_cosine():
    idx = VectorIndex(dim=4)
    idx.add_items([_rec("A", [1, 0, 0, 0]), _rec("B", [0, 1, 0, 0]), _rec("C", [0.9, 0.1, 0, 0])])
    ids = [h.id for h in idx.search([1, 0, 0, 0], k=2)]
    assert ids[0] == "A"
    assert "C" in ids and "B" not in ids


def test_identical_vector_scores_near_one():
    idx = VectorIndex(dim=3)
    idx.add_items([_rec("A", [1, 0, 0])])
    assert idx.search([1, 0, 0], k=1)[0].score > 0.99


def test_edu_level_post_filter_excludes_other_level():
    idx = VectorIndex(dim=3)
    idx.add_items([
        _rec("ZJ", [1, 0, 0], doc_type="kp", edu_level="专科"),
        _rec("BK", [1, 0, 0], doc_type="kp", edu_level="本科"),
    ])
    ids = [h.id for h in idx.search([1, 0, 0], k=5, edu_level="专科")]
    assert "ZJ" in ids and "BK" not in ids


def test_empty_index_returns_empty():
    assert VectorIndex(dim=4).search([1, 0, 0, 0], k=3) == []


@pytest.mark.integration
def test_build_from_mysql_indexes_existing_vectors():
    """读真库现有向量建索引，并用一条 reg_chunks 真实向量自查验证（只读、免费）。"""
    with _get_conn() as conn:
        idx = build_index(conn)
        cur = conn.cursor()
        # Phase-2 后从 reg_chunks 取向量自查（small_text embedding → 同一 reg_id 应排最近）
        cur.execute(
            "SELECT reg_id, embedding FROM reg_chunks WHERE embedding IS NOT NULL LIMIT 1"
        )
        reg_id, emb = cur.fetchone()
    assert idx.size >= 2000, f"索引应含 reg_chunks+kp 全部现有向量, 实际 {idx.size}"
    hits = idx.search(json.loads(emb), k=3)
    assert hits, "自查应返回结果"
    assert hits[0].id == reg_id, f"自查首位应为同一 reg_id，实际 {hits[0].id}"
    assert hits[0].score > 0.99, f"自查分应近 1.0，实际 {hits[0].score:.4f}"
