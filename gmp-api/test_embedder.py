# -*- coding: utf-8 -*-
"""
01-vector-engine 子任务3：MySQL 版 embedder 重写单测（纯逻辑，零成本）。

只测不连网、不写真库的纯函数 build_chunk_rows；真实重新嵌入（DashScope 付费）
与 DB 写入留到 spec 验收 A1 的付费闸门一次性跑。
"""
import json

import rag.embedder as embedder
from rag.embedder import build_chunk_rows

# 构造一段足够长、需要切成多块的法规正文（每句 ~50 字，以。结尾）
_LONG = "".join(
    f"第{i}条药品生产企业应当按照质量管理体系要求建立完善的操作规程并严格执行确保质量。"
    for i in range(1, 30)
)


def test_embedder_imports_without_db_path():
    """回归：原版 from config import DB_PATH + sqlite3 会 import 即崩，重写后应可正常导入。"""
    assert hasattr(embedder, "build_chunk_rows")
    assert hasattr(embedder, "rebuild_reg_chunks")


def test_build_chunk_rows_splits_long_content():
    rows = build_chunk_rows("REG-GMP2010-A010", "十", _LONG, small=120, big=600)
    assert len(rows) > 1, "长正文应被切成多块"
    assert all(r["reg_id"] == "REG-GMP2010-A010" for r in rows)
    assert [r["seq"] for r in rows] == list(range(len(rows))), "seq 应从0连续递增"
    assert all(r["small_text"] and r["big_text"] for r in rows)


def test_build_chunk_rows_carries_metadata():
    rows = build_chunk_rows(
        "REG-RISK-001", "说明", "洁净区监测应当定期开展。",
        doc_type="regulation", source_name="GMP检查缺陷清单", is_article=False,
    )
    meta = rows[0]["meta"]
    if isinstance(meta, str):
        meta = json.loads(meta)
    assert meta["article_num"] == "说明"
    assert meta["source_name"] == "GMP检查缺陷清单"
    assert meta["is_article"] is False
    assert meta["doc_type"] == "regulation"


def test_build_chunk_rows_short_content_single_row():
    rows = build_chunk_rows("REG-X-001", "一", "短条文。")
    assert len(rows) == 1
    assert rows[0]["small_text"] == "短条文。"
    assert rows[0]["big_text"] == "短条文。"


def test_build_chunk_rows_empty_content():
    assert build_chunk_rows("REG-X-002", "二", "") == []
