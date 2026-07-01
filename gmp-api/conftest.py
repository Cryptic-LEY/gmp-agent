"""
pytest 全局配置。

integration mark：需要本机 MySQL (3306) 的测试。
  - 运行所有测试（含集成）：py -3.11 -m pytest
  - 仅单元测试（跳过 DB）：  py -3.11 -m pytest -m "not integration"
"""
import socket
import pytest


def _db_is_up(host: str = "127.0.0.1", port: int = 3306, timeout: float = 1.0) -> bool:
    """快速 TCP 探针：避免 pymysql 等待全量 OS 超时。"""
    try:
        s = socket.create_connection((host, port), timeout=timeout)
        s.close()
        return True
    except OSError:
        return False


_DB_UP: bool = _db_is_up()


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "integration: marks tests that require a live MySQL database "
        "(deselect with -m 'not integration')",
    )


def pytest_runtest_setup(item):
    """在每个 integration 测试开始前检查 DB 可用性；不可用则 skip。"""
    if item.get_closest_marker("integration") and not _DB_UP:
        pytest.skip("MySQL unavailable — deselect with -m 'not integration'")
