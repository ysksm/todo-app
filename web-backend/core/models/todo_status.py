from __future__ import annotations

from enum import Enum


class TodoStatus(str, Enum):
    """タスクの進行状態。ToDo → Doing → Done と進む。"""

    TODO = "todo"
    DOING = "doing"
    DONE = "done"
