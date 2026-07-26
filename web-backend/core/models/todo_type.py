"""タスクの種類と、種類どうしの親子関係の決まり。

Product > Epic > UserStory > Task > SubTask は上下の決まった 1 本の階層で、
Bug だけがその外にいる。ここが唯一の判定元で、repository がこれを使って書き込みを弾く。
"""

from __future__ import annotations

from enum import StrEnum


class TodoType(StrEnum):
    PRODUCT = "product"
    EPIC = "epic"
    USER_STORY = "user_story"
    TASK = "task"
    SUBTASK = "subtask"
    BUG = "bug"


#: 上位から下位への並び。この順序だけが親子の向きを決める。
HIERARCHY: tuple[TodoType, ...] = (
    TodoType.PRODUCT,
    TodoType.EPIC,
    TodoType.USER_STORY,
    TodoType.TASK,
    TodoType.SUBTASK,
)

_RANKS: dict[TodoType, int] = {todo_type: rank for rank, todo_type in enumerate(HIERARCHY)}


def can_have_children(parent_type: TodoType) -> bool:
    """Bug は階層の外にいるので、子を持たない葉として扱う。"""
    return parent_type is not TodoType.BUG


def can_be_child_of(child_type: TodoType, parent_type: TodoType | None) -> bool:
    """その親子が成立するか。parent_type=None はルート。

    - ルートにはどの種類でも置ける
    - 階層飛ばし（Product の直下に Task）は許す
    - 逆流（Task の下に Epic）と同じ階層どうし（Task の下に Task）は許さない
    - Bug はどの種類の下にも置けるが、Bug 自身は子を持てない
    """
    if parent_type is None:
        return True
    if not can_have_children(parent_type):
        return False
    if child_type is TodoType.BUG:
        return True
    return _RANKS[parent_type] < _RANKS[child_type]


def allowed_child_types(parent_type: TodoType | None) -> tuple[TodoType, ...]:
    """その親の下に置ける種類を、階層の並び順で返す。"""
    return tuple(
        todo_type for todo_type in TodoType if can_be_child_of(todo_type, parent_type)
    )


def default_child_type(parent_type: TodoType | None) -> TodoType | None:
    """その親に子を足すときの既定の種類。置ける種類が無ければ None。

    ルートは Product、それ以外は 1 つ下の階層。SubTask の下は Bug しか置けない。
    """
    return next(iter(allowed_child_types(parent_type)), None)
