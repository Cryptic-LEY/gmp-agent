# -*- coding: utf-8 -*-
"""
语义缓存（02-context-perf）

进程内 LRU 向量缓存：
  - 以 cosine 相似度做命中判断（threshold 可调）
  - edu_level 作为命名空间（不同层次不共享缓存条目）
  - LRU 驱逐：超出 max_size 时删除最久未用条目
  - invalidate(reg_ids=None)：无参=全清；传 reg_ids=清涉及该条规的缓存
  - 进程级单例 _cache，由 get_cache() 暴露；与 vector_index.rebuild() 联动
"""
from __future__ import annotations

import threading
from collections import OrderedDict
from typing import Any

import numpy as np

from config import (
    SEMANTIC_CACHE_ENABLED,
    SEMANTIC_CACHE_MAX,
    SEMANTIC_CACHE_SIM_THRESHOLD,
)


def _normalize(vec: list[float] | np.ndarray) -> np.ndarray:
    v = np.asarray(vec, dtype=np.float32)
    n = np.linalg.norm(v)
    if n == 0.0:
        return v
    return v / n


class SemanticCache:
    """
    线程安全的进程内语义缓存。

    内部存储：OrderedDict[int, (norm_vec, edu_level, result)]
      - key = 自增 ID（保留插入顺序，用于 LRU 驱逐）
      - move_to_end() on hit = 更新最近使用时间
    """

    def __init__(self, max_size: int = 2000, threshold: float = 0.92) -> None:
        self._max       = max_size
        self._thr       = threshold
        self._store: OrderedDict[int, tuple[np.ndarray, str | None, dict]] = OrderedDict()
        self._next_id   = 0
        self._hits      = 0
        self._misses    = 0
        self._lock      = threading.Lock()

    # ── 公开 API ──────────────────────────────────────────────────────────────

    def get(
        self,
        query_vec: list[float],
        edu_level: str | None = None,
    ) -> dict | None:
        """
        查询缓存。命中返回 result dict，未命中返回 None。
        批量 dot product 比较所有同 edu_level 条目。
        """
        with self._lock:
            if not self._store:
                self._misses += 1
                return None

            q = _normalize(query_vec)

            # 过滤同 edu_level 的条目
            matching_ids: list[int] = []
            matching_vecs: list[np.ndarray] = []
            matching_results: list[dict] = []
            for eid, (v, edu, r) in self._store.items():
                if edu == edu_level:
                    matching_ids.append(eid)
                    matching_vecs.append(v)
                    matching_results.append(r)

            if not matching_ids:
                self._misses += 1
                return None

            matrix = np.stack(matching_vecs)     # (n, dim)
            sims   = matrix @ q                  # (n,)
            best   = int(np.argmax(sims))

            if sims[best] >= self._thr:
                eid = matching_ids[best]
                self._store.move_to_end(eid)     # 更新 LRU 顺序
                self._hits += 1
                return matching_results[best]

            self._misses += 1
            return None

    def put(
        self,
        query_vec: list[float],
        edu_level: str | None,
        result: dict,
    ) -> None:
        """写入缓存条目；超出 max_size 驱逐最旧 LRU 条目。"""
        with self._lock:
            if len(self._store) >= self._max:
                self._store.popitem(last=False)  # 驱逐最旧

            q   = _normalize(query_vec)
            eid = self._next_id
            self._next_id += 1
            self._store[eid] = (q, edu_level, result)

    def invalidate(self, reg_ids: list[str] | None = None) -> None:
        """
        清除缓存条目。
        reg_ids=None → 全清；
        reg_ids=[...] → 只清 sources 包含该 reg_id 的条目。
        """
        with self._lock:
            if reg_ids is None:
                self._store.clear()
                return

            reg_set = set(reg_ids)
            to_del = [
                eid
                for eid, (_, _, r) in self._store.items()
                if reg_set & set(r.get("sources", []))
            ]
            for eid in to_del:
                del self._store[eid]

    @property
    def hit_rate(self) -> float:
        total = self._hits + self._misses
        return self._hits / total if total > 0 else 0.0

    @property
    def size(self) -> int:
        return len(self._store)

    def reset_stats(self) -> None:
        with self._lock:
            self._hits = self._misses = 0


# ── 进程级单例 ────────────────────────────────────────────────────────────────

_cache = SemanticCache(max_size=SEMANTIC_CACHE_MAX, threshold=SEMANTIC_CACHE_SIM_THRESHOLD)


def get_cache() -> SemanticCache:
    """返回全局缓存实例（由 SEMANTIC_CACHE_ENABLED 控制是否启用）。"""
    return _cache
