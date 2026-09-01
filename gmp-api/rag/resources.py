"""RAG 热路径共享资源：有界 MySQL 连接池与检索线程池。"""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from threading import BoundedSemaphore, Lock

import pymysql
import pymysql.cursors
from dbutils.pooled_db import PooledDB

from config import (
    MYSQL_DATABASE,
    MYSQL_HOST,
    MYSQL_PASSWORD,
    MYSQL_POOL_ACQUIRE_TIMEOUT_SEC,
    MYSQL_POOL_SIZE,
    MYSQL_PORT,
    MYSQL_SSL_DISABLED,
    MYSQL_USER,
    RAG_RETRIEVE_WORKERS,
)


class DatabasePoolTimeout(TimeoutError):
    """连接池在限定时间内没有可用名额。"""


_resource_lock = Lock()
_db_pool = None
_db_slots: BoundedSemaphore | None = None
_retrieval_executor: ThreadPoolExecutor | None = None


def _create_pool() -> PooledDB:
    return PooledDB(
        creator=pymysql,
        mincached=0,
        maxcached=MYSQL_POOL_SIZE,
        maxshared=0,
        maxconnections=MYSQL_POOL_SIZE,
        blocking=False,
        ping=1,
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DATABASE,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.Cursor,
        connect_timeout=2,
        ssl_disabled=MYSQL_SSL_DISABLED,
    )


def _get_pool():
    global _db_pool
    with _resource_lock:
        if _db_pool is None:
            _db_pool = _create_pool()
        return _db_pool


def _get_db_slots() -> BoundedSemaphore:
    global _db_slots
    with _resource_lock:
        if _db_slots is None:
            _db_slots = BoundedSemaphore(MYSQL_POOL_SIZE)
        return _db_slots


@contextmanager
def get_db_connection():
    """在超时预算内借出一条专用连接，退出上下文时归还连接和名额。"""
    slots = _get_db_slots()
    acquired = slots.acquire(timeout=MYSQL_POOL_ACQUIRE_TIMEOUT_SEC)
    if not acquired:
        raise DatabasePoolTimeout(
            "MySQL connection pool exhausted after "
            f"{MYSQL_POOL_ACQUIRE_TIMEOUT_SEC:.3f}s "
            f"(max_connections={MYSQL_POOL_SIZE})"
        )

    conn = None
    try:
        conn = _get_pool().connection()
        yield conn
    finally:
        try:
            if conn is not None:
                conn.close()
        finally:
            slots.release()


def get_retrieval_executor() -> ThreadPoolExecutor:
    """返回进程级共享检索执行器；首次调用时惰性创建。"""
    global _retrieval_executor
    with _resource_lock:
        if _retrieval_executor is None:
            _retrieval_executor = ThreadPoolExecutor(
                max_workers=RAG_RETRIEVE_WORKERS,
                thread_name_prefix="rag-retrieve",
            )
        return _retrieval_executor


def close_rag_resources() -> None:
    """停止共享执行器并关闭池内连接；重复调用安全。"""
    global _db_pool, _db_slots, _retrieval_executor
    with _resource_lock:
        executor, _retrieval_executor = _retrieval_executor, None
        pool, _db_pool = _db_pool, None
        _db_slots = None

    if executor is not None:
        executor.shutdown(wait=True, cancel_futures=False)
    if pool is not None:
        pool.close()
