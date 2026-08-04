from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from core.models.todo import Todo, TodoCreate
from core.models.todo_type import TodoType, default_child_type
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
def mcp_settings(tmp_path: Path) -> McpSettings:
    return McpSettings(
        api_key=TEST_API_KEY,
        mount_path="/mcp",
        server_name="todo-app",
        allowed_hosts=("testserver",),
        oauth_store_file=tmp_path / "mcp_oauth.json",
    )


@pytest.fixture
def client(service: TodoService, mcp_settings: McpSettings) -> Iterator[TestClient]:
    # MCP の session manager を動かすため、lifespan を回す with 付きで使う。
    with TestClient(create_app(mcp_settings, todo_service=service)) as client:
        yield client


@pytest.fixture
def add_todo(service: TodoService):
    def add(
        title: str,
        parent_id: int | None = None,
        todo_type: TodoType | None = None,
    ) -> Todo:
        """種類を省略したら親の 1 つ下の階層（ルートなら product）で作る。"""
        parent_type = service.get_todo(parent_id).type if parent_id is not None else None
        return service.create_todo(
            TodoCreate(
                title=title,
                parent_id=parent_id,
                type=todo_type or default_child_type(parent_type) or TodoType.TASK,
            )
        )

    return add
