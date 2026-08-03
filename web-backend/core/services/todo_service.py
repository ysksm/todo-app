from __future__ import annotations

from collections import defaultdict

from core.errors import TodoNotFoundError
from core.events import TodoEvent, TodoEventBroker
from core.models.todo import Todo, TodoCreate, TodoMove, TodoUpdate
from core.models.todo_status import TodoStatus
from core.repositories.todo_repository import TodoRepository

#: 木のテキスト表現で使う状態マーカー。
STATUS_MARKS = {
    TodoStatus.TODO: "[ ]",
    TodoStatus.DOING: "[~]",
    TodoStatus.DONE: "[x]",
}


class TodoService:
    """アプリの全機能。webapi / mcp / cli はどれもこのクラスだけを呼ぶ。

    見つからなかった場合に None を返す代わりに TodoNotFoundError を送出するので、
    どのインターフェースからでも同じ失敗の扱いになる。

    変更が成功するたびに events へ発行する。ここで発行することで、
    Web API と MCP のどちら経由の変更でも同じ通知が流れる。
    """

    def __init__(self, repository: TodoRepository, events: TodoEventBroker | None = None) -> None:
        self.repository = repository
        self.events = events or TodoEventBroker()

    def list_todos(self, status: TodoStatus | None = None) -> list[Todo]:
        """深さ優先・position 昇順で返す。status を渡すとその状態だけに絞る。"""
        todos = self.repository.list()
        if status is None:
            return todos
        return [todo for todo in todos if todo.status is status]

    def get_todo(self, todo_id: int) -> Todo:
        todo = self.repository.get(todo_id)
        if todo is None:
            raise TodoNotFoundError(todo_id)
        return todo

    def create_todo(self, todo_create: TodoCreate) -> Todo:
        """親を指定した場合はその末尾に追加する。親が無ければ ParentNotFoundError。

        種類の上下関係に反する親子は InvalidHierarchyError。
        """
        todo = self.repository.create(todo_create)
        self.events.publish(TodoEvent(action="created", ids=(todo.id,)))
        return todo

    def update_todo(self, todo_id: int, todo_update: TodoUpdate) -> Todo:
        """本文と種類を更新する。親子関係と並び順は保持される。

        いまの親や子と辻褄が合わない種類へは変えられず、InvalidHierarchyError になる。
        """
        todo = self.repository.update(todo_id, todo_update)
        if todo is None:
            raise TodoNotFoundError(todo_id)
        self.events.publish(TodoEvent(action="updated", ids=(todo.id,)))
        return todo

    def move_todo(self, todo_id: int, todo_move: TodoMove) -> Todo:
        """親と並び順を変更する。

        循環する移動は CyclicMoveError、種類の上下関係に反する移動は InvalidHierarchyError。
        """
        todo = self.repository.move(todo_id, todo_move)
        if todo is None:
            raise TodoNotFoundError(todo_id)
        self.events.publish(TodoEvent(action="moved", ids=(todo.id,)))
        return todo

    def delete_todo(self, todo_id: int) -> list[int]:
        """対象とその子孫を削除し、削除した id を返す。"""
        removed_ids = self.repository.delete(todo_id)
        if not removed_ids:
            raise TodoNotFoundError(todo_id)
        self.events.publish(TodoEvent(action="deleted", ids=tuple(removed_ids)))
        return removed_ids

    def render_tree(self) -> str:
        """人間と LLM が読むための木のテキスト表現。"""
        todos = self.list_todos()
        if not todos:
            return "(タスクはありません)"

        depths = self._depths(todos)
        return "\n".join(
            f"{'  ' * depths[todo.id]}{STATUS_MARKS[todo.status]} "
            f"#{todo.id} ({todo.type}) {todo.title}"
            + (f" — {todo.description}" if todo.description else "")
            for todo in todos
        )

    @staticmethod
    def _depths(todos: list[Todo]) -> dict[int, int]:
        children_by_parent: dict[int | None, list[Todo]] = defaultdict(list)
        for todo in todos:
            children_by_parent[todo.parent_id].append(todo)

        depths: dict[int, int] = {}
        stack: list[tuple[Todo, int]] = [(todo, 0) for todo in reversed(children_by_parent[None])]
        while stack:
            todo, depth = stack.pop()
            depths[todo.id] = depth
            stack.extend((child, depth + 1) for child in reversed(children_by_parent[todo.id]))
        return depths
