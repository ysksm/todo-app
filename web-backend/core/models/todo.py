from pydantic import BaseModel

from core.models.todo_type import TodoType


class TodoBase(BaseModel):
    title: str
    description: str = ""
    completed: bool = False
    #: 省略時は Task。type を持たない古い行を読むときもここが効く。
    type: TodoType = TodoType.TASK


class TodoCreate(TodoBase):
    """POST /api/todos 用。parent_id が None ならルートとして追加する。"""

    parent_id: int | None = None


class TodoUpdate(TodoBase):
    """PUT /api/todos/{id} 用。親子関係は変更しないが、type は変更できる。"""


class TodoMove(BaseModel):
    """PATCH /api/todos/{id}/move 用。position が None なら末尾へ移動する。"""

    parent_id: int | None = None
    position: int | None = None


class Todo(TodoBase):
    id: int
    parent_id: int | None = None
    position: int = 0
