from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from core.models.todo import Todo, TodoCreate
from core.repositories.todo_repository import TodoRepository
from core.services.todo_service import TodoService
from interfaces.mcp.config import McpSettings
from interfaces.webapi.app import create_app

TEST_API_KEY = "test-mcp-api-key"


@pytest.fixture
def repository(tmp_path: Path) -> TodoRepository:
    return TodoRepository(data_file=tmp_path / "todos.jsonl")


@pytest.fixture
def service(repository: TodoRepository) -> TodoService:
    return TodoService(repository)


@pytest.fixture
def mcp_settings() -> McpSettings:
    return McpSettings(
        api_key=TEST_API_KEY,
        mount_path="/mcp",
        server_name="todo-app",
        allowed_hosts=("testserver",),
    )


@pytest.fixture
def client(service: TodoService, mcp_settings: McpSettings) -> Iterator[TestClient]:
    # MCP の session manager を動かすため、lifespan を回す with 付きで使う。
    with TestClient(create_app(mcp_settings, todo_service=service)) as client:
        yield client


@pytest.fixture
def add_todo(service: TodoService):
    def add(title: str, parent_id: int | None = None) -> Todo:
        return service.create_todo(TodoCreate(title=title, parent_id=parent_id))

    return add
