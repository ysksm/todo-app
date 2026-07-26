from __future__ import annotations

from collections import defaultdict

from core.errors import TodoNotFoundError
from core.models.todo import Todo, TodoCreate, TodoMove, TodoUpdate
from core.repositories.todo_repository import TodoRepository


class TodoService:
    """アプリの全機能。webapi / mcp / cli はどれもこのクラスだけを呼ぶ。

    見つからなかった場合に None を返す代わりに TodoNotFoundError を送出するので、
    どのインターフェースからでも同じ失敗の扱いになる。
    """

    def __init__(self, repository: TodoRepository) -> None:
        self.repository = repository

    def list_todos(self) -> list[Todo]:
        """深さ優先・position 昇順で全件返す。"""
        return self.repository.list()

    def get_todo(self, todo_id: int) -> Todo:
        todo = self.repository.get(todo_id)
        if todo is None:
            raise TodoNotFoundError(todo_id)
        return todo

    def create_todo(self, todo_create: TodoCreate) -> Todo:
        """親を指定した場合はその末尾に追加する。親が無ければ ParentNotFoundError。"""
        return self.repository.create(todo_create)

    def update_todo(self, todo_id: int, todo_update: TodoUpdate) -> Todo:
        """本文だけを更新する。親子関係と並び順は保持される。"""
        todo = self.repository.update(todo_id, todo_update)
        if todo is None:
            raise TodoNotFoundError(todo_id)
        return todo

    def move_todo(self, todo_id: int, todo_move: TodoMove) -> Todo:
        """親と並び順を変更する。循環する移動は CyclicMoveError。"""
        todo = self.repository.move(todo_id, todo_move)
        if todo is None:
            raise TodoNotFoundError(todo_id)
        return todo

    def delete_todo(self, todo_id: int) -> list[int]:
        """対象とその子孫を削除し、削除した id を返す。"""
        removed_ids = self.repository.delete(todo_id)
        if not removed_ids:
            raise TodoNotFoundError(todo_id)
        return removed_ids

    def render_tree(self) -> str:
        """人間と LLM が読むための木のテキスト表現。"""
        todos = self.list_todos()
        if not todos:
            return "(タスクはありません)"

        depths = self._depths(todos)
        return "\n".join(
            f"{'  ' * depths[todo.id]}{'[x]' if todo.completed else '[ ]'} #{todo.id} {todo.title}"
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
