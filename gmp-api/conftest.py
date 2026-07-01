"""
pytest 全局配置。

integration mark：需要本机 MySQL (3306) 的测试。
  - 运行所有测试（含集成）：py -3.11 -m pytest
  - 仅单元测试：          py -3.11 -m pytest -m "not integration"
"""
import pytest


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "integration: marks tests that require a live MySQL database "
        "(deselect with -m 'not integration')",
    )
