from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from core.models.todo import TodoCreate, TodoUpdate
from core.repositories.todo_repository import DEFAULT_DATA_FILE, TodoRepository

WEB_BACKEND_ROOT = Path(__file__).resolve().parents[1]


class TestDefaultDataFile:
    def test_default_points_at_the_web_backend_data_directory(self, monkeypatch) -> None:
        """core/ へ移設したときに web-backend/core/data/ へずれた回帰を防ぐ。"""
        monkeypatch.delenv("TODO_DATA_FILE", raising=False)

        assert TodoRepository().data_file == WEB_BACKEND_ROOT / "data" / "todos.jsonl"
        assert DEFAULT_DATA_FILE == WEB_BACKEND_ROOT / "data" / "todos.jsonl"

    def test_environment_variable_overrides_the_default(self, monkeypatch, tmp_path: Path) -> None:
        monkeypatch.setenv("TODO_DATA_FILE", str(tmp_path / "custom.jsonl"))

        assert TodoRepository().data_file == tmp_path / "custom.jsonl"

    def test_explicit_argument_wins_over_the_environment(self, monkeypatch, tmp_path: Path) -> None:
        monkeypatch.setenv("TODO_DATA_FILE", str(tmp_path / "from-env.jsonl"))

        repository = TodoRepository(data_file=tmp_path / "explicit.jsonl")

        assert repository.data_file == tmp_path / "explicit.jsonl"

    def test_lock_file_sits_next_to_the_data_file(self, tmp_path: Path) -> None:
        repository = TodoRepository(data_file=tmp_path / "todos.jsonl")

        assert repository.lock_file == tmp_path / "todos.jsonl.lock"


class TestConcurrentWrites:
    """Web API・MCP・CLI が同じファイルを触るので、読み書きは排他されている必要がある。"""

    def test_parallel_creates_keep_every_todo_with_a_unique_id(self, tmp_path: Path) -> None:
        data_file = tmp_path / "todos.jsonl"
        create_count = 24

        def create(index: int) -> None:
            # 各スレッドが自分のリポジトリを持つ = 別プロセスに近い状況にする
            TodoRepository(data_file=data_file).create(TodoCreate(title=f"todo-{index}"))

        with ThreadPoolExecutor(max_workers=8) as executor:
            list(executor.map(create, range(create_count)))

        todos = TodoRepository(data_file=data_file).list()

        assert len(todos) == create_count
        assert len({todo.id for todo in todos}) == create_count
        assert {todo.title for todo in todos} == {f"todo-{index}" for index in range(create_count)}

    def test_parallel_updates_do_not_lose_todos(self, tmp_path: Path) -> None:
        data_file = tmp_path / "todos.jsonl"
        repository = TodoRepository(data_file=data_file)
        todos = [repository.create(TodoCreate(title=f"todo-{index}")) for index in range(10)]

        def rename(todo_id: int) -> None:
            TodoRepository(data_file=data_file).update(
                todo_id, TodoUpdate(title=f"renamed-{todo_id}")
            )

        with ThreadPoolExecutor(max_workers=8) as executor:
            list(executor.map(rename, [todo.id for todo in todos]))

        stored = TodoRepository(data_file=data_file).list()

        assert len(stored) == 10
        assert {todo.title for todo in stored} == {f"renamed-{todo.id}" for todo in todos}
