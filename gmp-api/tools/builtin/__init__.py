"""内置工具统一注册入口。"""
from __future__ import annotations


def _register_all() -> None:
    """把所有内置工具注册到全局 registry。仅在 registry.py 导入时调用一次。"""
    from tools.registry import register
    from tools.builtin.search import search_regulation
    from tools.builtin.profile import get_user_profile, update_user_profile
    from tools.builtin.learning import plan_learning_path
    from tools.builtin.content import review_assignment, generate_courseware

    for t in (
        search_regulation,
        get_user_profile,
        update_user_profile,
        plan_learning_path,
        review_assignment,
        generate_courseware,
    ):
        register(t)
