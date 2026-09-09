"""SupabaseTodoRepository と TODO_STORAGE による切り替えのテスト。

実際の Supabase には接続せず、PostgREST の挙動を模した httpx.MockTransport で
リポジトリの読み書きを検証する。
"""

from __future__ import annotations

import json

import httpx
import pytest

from core.models.todo import TodoCreate, TodoMove, TodoUpdate
from core.models.todo_type import TodoType
from core.repositories.factory import create_todo_repository
from core.repositories.supabase_todo_repository import (
    SupabaseConfigError,
    SupabaseRequestError,
    SupabaseTodoRepository,
)
from core.repositories.todo_repository import TodoRepository

SUPABASE_URL = "https://example.supabase.co"
SUPABASE_KEY = "service-role-key"


class FakePostgrest:
    """/rest/v1/todos の GET（一覧）・POST（upsert）・DELETE（フィルタ削除）を模す。"""

    def __init__(self) -> None:
        self.rows: dict[int, dict] = {}
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.headers.get("apikey") != SUPABASE_KEY:
            return httpx.Response(401, json={"message": "apikey がありません"})
        if request.url.path != "/rest/v1/todos":
            return httpx.Response(404, json={"message": "不明なテーブル"})

        match request.method:
            case "GET":
                assert request.url.params.get("order") == "id.asc"
                rows = [self.rows[row_id] for row_id in sorted(self.rows)]
                return httpx.Response(200, json=rows)
            case "POST":
                assert request.url.params.get("on_conflict") == "id"
                assert "merge-duplicates" in request.headers.get("Prefer", "")
                for row in json.loads(request.content):
                    self.rows[row["id"]] = row
                return httpx.Response(201)
            case "DELETE":
                id_filter = request.url.params.get("id")
                if id_filter == "not.is.null":
                    self.rows.clear()
                elif id_filter.startswith("not.in.(") and id_filter.endswith(")"):
                    kept = {int(value) for value in id_filter[8:-1].split(",")}
                    self.rows = {
                        row_id: row for row_id, row in self.rows.items() if row_id in kept
                    }
                else:
                    return httpx.Response(400, json={"message": f"不明なフィルタ: {id_filter}"})
                return httpx.Response(204)

        return httpx.Response(405)


@pytest.fixture
def fake() -> FakePostgrest:
    return FakePostgrest()


@pytest.fixture
def repository(fake: FakePostgrest) -> SupabaseTodoRepository:
    return SupabaseTodoRepository(
        url=SUPABASE_URL,
        key=SUPABASE_KEY,
        transport=httpx.MockTransport(fake.handler),
    )


class TestSupabaseTodoRepository:
    def test_create_persists_row_and_reads_back(
        self, repository: SupabaseTodoRepository, fake: FakePostgrest
    ) -> None:
        created = repository.create(TodoCreate(title="買い物", description="牛乳"))

        assert created.id == 1
        assert fake.rows[1]["title"] == "買い物"
        assert fake.rows[1]["status"] == "todo"

        todos = repository.list()
        assert [todo.title for todo in todos] == ["買い物"]
        assert todos[0].description == "牛乳"

    def test_ids_continue_from_existing_rows(
        self, repository: SupabaseTodoRepository, fake: FakePostgrest
    ) -> None:
        repository.create(TodoCreate(title="1 件目"))
        repository.create(TodoCreate(title="2 件目"))

        assert sorted(fake.rows) == [1, 2]

    def test_update_changes_row_in_place(
        self, repository: SupabaseTodoRepository, fake: FakePostgrest
    ) -> None:
        created = repository.create(TodoCreate(title="旧タイトル"))

        updated = repository.update(created.id, TodoUpdate(title="新タイトル"))

        assert updated is not None and updated.title == "新タイトル"
        assert fake.rows[created.id]["title"] == "新タイトル"

    def test_move_renumbers_siblings(self, repository: SupabaseTodoRepository) -> None:
        first = repository.create(TodoCreate(title="先"))
        second = repository.create(TodoCreate(title="後"))

        repository.move(second.id, TodoMove(parent_id=None, position=0))

        assert [todo.id for todo in repository.list()] == [second.id, first.id]

    def test_delete_removes_descendants_from_table(
        self, repository: SupabaseTodoRepository, fake: FakePostgrest
    ) -> None:
        parent = repository.create(TodoCreate(title="親", type=TodoType.EPIC))
        child = repository.create(
            TodoCreate(title="子", parent_id=parent.id, type=TodoType.TASK)
        )
        other = repository.create(TodoCreate(title="無関係"))

        removed_ids = repository.delete(parent.id)

        assert removed_ids == [parent.id, child.id]
        assert sorted(fake.rows) == [other.id]

    def test_deleting_last_todo_empties_table(
        self, repository: SupabaseTodoRepository, fake: FakePostgrest
    ) -> None:
        created = repository.create(TodoCreate(title="唯一"))

        repository.delete(created.id)

        assert fake.rows == {}
        assert repository.list() == []

    def test_sends_service_key_in_headers(
        self, repository: SupabaseTodoRepository, fake: FakePostgrest
    ) -> None:
        repository.list()

        request = fake.requests[-1]
        assert request.headers["apikey"] == SUPABASE_KEY
        assert request.headers["Authorization"] == f"Bearer {SUPABASE_KEY}"

    def test_error_response_raises_supabase_request_error(self) -> None:
        transport = httpx.MockTransport(
            lambda request: httpx.Response(500, json={"message": "壊れています"})
        )
        repository = SupabaseTodoRepository(
            url=SUPABASE_URL, key=SUPABASE_KEY, transport=transport
        )

        with pytest.raises(SupabaseRequestError, match="500"):
            repository.list()

    def test_missing_configuration_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("SUPABASE_URL", raising=False)
        monkeypatch.delenv("SUPABASE_KEY", raising=False)

        with pytest.raises(SupabaseConfigError):
            SupabaseTodoRepository()


class TestCreateTodoRepository:
    def test_defaults_to_jsonl(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("TODO_STORAGE", raising=False)

        repository = create_todo_repository()

        assert type(repository) is TodoRepository

    def test_explicit_data_file_wins_over_supabase(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path
    ) -> None:
        monkeypatch.setenv("TODO_STORAGE", "supabase")

        repository = create_todo_repository(data_file=tmp_path / "todos.jsonl")

        assert type(repository) is TodoRepository
        assert repository.data_file == tmp_path / "todos.jsonl"

    def test_supabase_storage_builds_supabase_repository(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("TODO_STORAGE", "supabase")
        monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setenv("SUPABASE_KEY", SUPABASE_KEY)

        repository = create_todo_repository()

        assert isinstance(repository, SupabaseTodoRepository)
        assert repository.table == "todos"

    def test_supabase_table_name_is_configurable(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("TODO_STORAGE", "supabase")
        monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
        monkeypatch.setenv("SUPABASE_KEY", SUPABASE_KEY)
        monkeypatch.setenv("SUPABASE_TODOS_TABLE", "my_todos")

        repository = create_todo_repository()

        assert isinstance(repository, SupabaseTodoRepository)
        assert repository.table == "my_todos"

    def test_unknown_storage_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TODO_STORAGE", "mysql")

        with pytest.raises(ValueError, match="TODO_STORAGE"):
            create_todo_repository()
