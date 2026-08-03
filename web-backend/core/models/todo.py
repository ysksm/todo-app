from typing import Any

from pydantic import BaseModel, model_validator

from core.models.todo_status import TodoStatus
from core.models.todo_type import TodoType


class TodoBase(BaseModel):
    title: str
    description: str = ""
    #: 省略時は ToDo。
    status: TodoStatus = TodoStatus.TODO
    #: 省略時は Task。type を持たない古い行を読むときもここが効く。
    type: TodoType = TodoType.TASK

    @model_validator(mode="before")
    @classmethod
    def _migrate_legacy_completed(cls, data: Any) -> Any:
        """status を入れる前の行・リクエストは completed: bool を持つ。

        completed=true は done、false は todo として読む。
        """
        if isinstance(data, dict) and "status" not in data and "completed" in data:
            data = dict(data)
            data["status"] = TodoStatus.DONE if data.pop("completed") else TodoStatus.TODO
        return data


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
