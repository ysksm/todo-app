from __future__ import annotations

import os
from pathlib import Path

from models.todo import Todo, TodoCreate


class TodoRepository:
    def __init__(self, data_file: Path | None = None) -> None:
        configured_path = os.environ.get("TODO_DATA_FILE")
        self.data_file = data_file or Path(
            configured_path or Path(__file__).parent.parent / "data" / "todos.jsonl"
        )

    def list(self) -> list[Todo]:
        return self._read_todos()

    def get(self, todo_id: int) -> Todo | None:
        return next((todo for todo in self._read_todos() if todo.id == todo_id), None)

    def create(self, todo_create: TodoCreate) -> Todo:
        todos = self._read_todos()
        next_id = max((todo.id for todo in todos), default=0) + 1
        todo = Todo(id=next_id, **todo_create.model_dump())
        todos.append(todo)
        self._write_todos(todos)
        return todo

    def update(self, todo_id: int, todo_update: TodoCreate) -> Todo | None:
        todos = self._read_todos()
        for index, existing_todo in enumerate(todos):
            if existing_todo.id == todo_id:
                todo = Todo(id=todo_id, **todo_update.model_dump())
                todos[index] = todo
                self._write_todos(todos)
                return todo
        return None

    def delete(self, todo_id: int) -> bool:
        todos = self._read_todos()
        filtered_todos = [todo for todo in todos if todo.id != todo_id]
        if len(filtered_todos) == len(todos):
            return False
        self._write_todos(filtered_todos)
        return True

    def _read_todos(self) -> list[Todo]:
        if not self.data_file.exists():
            return []

        with self.data_file.open(encoding="utf-8") as file:
            return [
                Todo.model_validate_json(line)
                for line in file
                if line.strip()
            ]

    def _write_todos(self, todos: list[Todo]) -> None:
        self.data_file.parent.mkdir(parents=True, exist_ok=True)
        temporary_file = self.data_file.with_suffix(f"{self.data_file.suffix}.tmp")
        with temporary_file.open("w", encoding="utf-8") as file:
            for todo in todos:
                file.write(f"{todo.model_dump_json()}\n")
        temporary_file.replace(self.data_file)
