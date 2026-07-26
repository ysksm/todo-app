from __future__ import annotations

import os
from collections import defaultdict
from contextlib import contextmanager
from collections.abc import Iterator
from pathlib import Path

from core.models.todo import Todo, TodoCreate, TodoMove, TodoUpdate
from core.models.todo_type import TodoType, can_be_child_of
from core.errors import CyclicMoveError, InvalidHierarchyError, ParentNotFoundError

try:
    import fcntl
except ImportError:  # pragma: no cover — POSIX 以外では排他なしで動かす
    fcntl = None  # type: ignore[assignment]

# web-backend/data/todos.jsonl。パッケージの階層を変えたらここも直す。
DEFAULT_DATA_FILE = Path(__file__).resolve().parents[2] / "data" / "todos.jsonl"


class TodoRepository:
    def __init__(self, data_file: Path | None = None) -> None:
        configured_path = os.environ.get("TODO_DATA_FILE")
        self.data_file = data_file or (
            Path(configured_path) if configured_path else DEFAULT_DATA_FILE
        )
        self.lock_file = self.data_file.with_name(f"{self.data_file.name}.lock")

    def list(self) -> list[Todo]:
        """深さ優先・position 昇順で返す。"""
        return self._depth_first(self._read_todos())

    def get(self, todo_id: int) -> Todo | None:
        return next((todo for todo in self._read_todos() if todo.id == todo_id), None)

    def descendant_ids(self, todo_id: int) -> set[int]:
        return self._descendant_ids(self._read_todos(), todo_id)

    def create(self, todo_create: TodoCreate) -> Todo:
        with self._locked():
            todos = self._read_todos()
            parent_id = todo_create.parent_id
            parent = next((todo for todo in todos if todo.id == parent_id), None)
            if parent_id is not None and parent is None:
                raise ParentNotFoundError(parent_id)
            self._require_valid_hierarchy(todo_create.type, parent)

            next_id = max((todo.id for todo in todos), default=0) + 1
            position = sum(1 for todo in todos if todo.parent_id == parent_id)
            todo = Todo(id=next_id, position=position, **todo_create.model_dump())
            todos.append(todo)
            self._write_todos(todos)
            return todo

    def update(self, todo_id: int, todo_update: TodoUpdate) -> Todo | None:
        """親子関係と並び順は保持したまま、本文と種類を更新する。"""
        with self._locked():
            todos = self._read_todos()
            for index, existing_todo in enumerate(todos):
                if existing_todo.id == todo_id:
                    if todo_update.type is not existing_todo.type:
                        self._require_valid_type_change(todos, existing_todo, todo_update.type)
                    todo = existing_todo.model_copy(update=todo_update.model_dump())
                    todos[index] = todo
                    self._write_todos(todos)
                    return todo
            return None

    def move(self, todo_id: int, todo_move: TodoMove) -> Todo | None:
        with self._locked():
            todos = self._read_todos()
            target = next((todo for todo in todos if todo.id == todo_id), None)
            if target is None:
                return None

            parent_id = todo_move.parent_id
            if parent_id is not None:
                parent = next((todo for todo in todos if todo.id == parent_id), None)
                if parent is None:
                    raise ParentNotFoundError(parent_id)
                if parent_id == todo_id or parent_id in self._descendant_ids(todos, todo_id):
                    raise CyclicMoveError(todo_id, parent_id)
                self._require_valid_hierarchy(target.type, parent)

            siblings = sorted(
                (todo for todo in todos if todo.parent_id == parent_id and todo.id != todo_id),
                key=lambda todo: todo.position,
            )
            position = len(siblings) if todo_move.position is None else todo_move.position
            position = max(0, min(position, len(siblings)))

            moved = target.model_copy(update={"parent_id": parent_id, "position": position})
            siblings.insert(position, moved)
            renumbered = {todo.id: index for index, todo in enumerate(siblings)}

            updated: list[Todo] = []
            for todo in todos:
                if todo.id == todo_id:
                    todo = moved
                if todo.id in renumbered:
                    todo = todo.model_copy(update={"position": renumbered[todo.id]})
                updated.append(todo)

            self._write_todos(updated)
            return moved

    def delete(self, todo_id: int) -> list[int]:
        """対象とその子孫を削除し、削除した id を返す。存在しなければ空リスト。"""
        with self._locked():
            todos = self._read_todos()
            if not any(todo.id == todo_id for todo in todos):
                return []

            removed_ids = {todo_id} | self._descendant_ids(todos, todo_id)
            self._write_todos([todo for todo in todos if todo.id not in removed_ids])
            return sorted(removed_ids)

    @staticmethod
    def _require_valid_hierarchy(child_type: TodoType, parent: Todo | None) -> None:
        """親の下にその種類を置けるか。ルート（parent=None）にはどの種類でも置ける。"""
        if parent is not None and not can_be_child_of(child_type, parent.type):
            raise InvalidHierarchyError(child_type, parent.type)

    @staticmethod
    def _require_valid_type_change(todos: list[Todo], todo: Todo, new_type: TodoType) -> None:
        """種類を変えると、いまの親とも子とも辻褄が合わなくなることがあるので両方見る。"""
        parent = next((candidate for candidate in todos if candidate.id == todo.parent_id), None)
        TodoRepository._require_valid_hierarchy(new_type, parent)

        for child in todos:
            if child.parent_id == todo.id and not can_be_child_of(child.type, new_type):
                raise InvalidHierarchyError(child.type, new_type)

    @contextmanager
    def _locked(self) -> Iterator[None]:
        """読み込みから書き戻しまでを排他する。

        Web API・MCP・CLI が同じ JSONL を触るため、プロセス内のスレッド間だけでなく
        別プロセス間でも効く必要がある。そのため flock を使う。
        """
        if fcntl is None:  # pragma: no cover — POSIX 以外
            yield
            return

        self.lock_file.parent.mkdir(parents=True, exist_ok=True)
        with self.lock_file.open("a+") as lock_handle:
            fcntl.flock(lock_handle, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock_handle, fcntl.LOCK_UN)

    def _read_todos(self) -> list[Todo]:
        if not self.data_file.exists():
            return []

        with self.data_file.open(encoding="utf-8") as file:
            todos = [
                Todo.model_validate_json(line)
                for line in file
                if line.strip()
            ]
        return self._normalize(todos)

    def _write_todos(self, todos: list[Todo]) -> None:
        normalized_todos = self._normalize(todos)
        self.data_file.parent.mkdir(parents=True, exist_ok=True)
        temporary_file = self.data_file.with_suffix(f"{self.data_file.suffix}.tmp")
        with temporary_file.open("w", encoding="utf-8") as file:
            for todo in normalized_todos:
                file.write(f"{todo.model_dump_json()}\n")
        temporary_file.replace(self.data_file)

    @staticmethod
    def _normalize(todos: list[Todo]) -> list[Todo]:
        """孤児・循環・position の乱れを修復する。要素の並び自体は変えない。"""
        existing_ids = {todo.id for todo in todos}
        rooted = [
            todo if todo.parent_id is None or todo.parent_id in existing_ids
            else todo.model_copy(update={"parent_id": None})
            for todo in todos
        ]
        acyclic = TodoRepository._break_cycles(rooted)

        file_order = {todo.id: index for index, todo in enumerate(acyclic)}
        siblings_by_parent: dict[int | None, list[Todo]] = defaultdict(list)
        for todo in acyclic:
            siblings_by_parent[todo.parent_id].append(todo)

        positions: dict[int, int] = {}
        for siblings in siblings_by_parent.values():
            siblings.sort(key=lambda todo: (todo.position, file_order[todo.id]))
            for position, todo in enumerate(siblings):
                positions[todo.id] = position

        return [
            todo.model_copy(update={"position": positions[todo.id]})
            for todo in acyclic
        ]

    @staticmethod
    def _break_cycles(todos: list[Todo]) -> list[Todo]:
        """親を辿って循環していたら、その入口をルートへ戻す（データ破損時の保険）。"""
        parents = {todo.id: todo.parent_id for todo in todos}
        cut_ids: set[int] = set()

        for todo_id in parents:
            visited = {todo_id}
            current_id = parents[todo_id]
            while current_id is not None:
                if current_id in visited:
                    cut_ids.add(current_id)
                    parents[current_id] = None
                    break
                visited.add(current_id)
                current_id = parents[current_id]

        return [
            todo.model_copy(update={"parent_id": None}) if todo.id in cut_ids else todo
            for todo in todos
        ]

    @staticmethod
    def _descendant_ids(todos: list[Todo], todo_id: int) -> set[int]:
        children_by_parent: dict[int | None, list[int]] = defaultdict(list)
        for todo in todos:
            children_by_parent[todo.parent_id].append(todo.id)

        descendant_ids: set[int] = set()
        stack = list(children_by_parent[todo_id])
        while stack:
            current_id = stack.pop()
            if current_id in descendant_ids:
                continue
            descendant_ids.add(current_id)
            stack.extend(children_by_parent[current_id])
        return descendant_ids

    @staticmethod
    def _depth_first(todos: list[Todo]) -> list[Todo]:
        children_by_parent: dict[int | None, list[Todo]] = defaultdict(list)
        for todo in todos:
            children_by_parent[todo.parent_id].append(todo)
        for children in children_by_parent.values():
            children.sort(key=lambda todo: todo.position)

        ordered: list[Todo] = []
        stack = list(reversed(children_by_parent[None]))
        while stack:
            todo = stack.pop()
            ordered.append(todo)
            stack.extend(reversed(children_by_parent[todo.id]))
        return ordered
