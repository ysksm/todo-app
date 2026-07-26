from pathlib import Path

from fastapi.testclient import TestClient

from core.models.todo import TodoCreate
from core.repositories.todo_repository import TodoRepository
from core.services.todo_service import TodoService
from interfaces.mcp.config import McpSettings


def build_app(tmp_path: Path, name: str):
    from interfaces.webapi.app import create_app

    service = TodoService(TodoRepository(data_file=tmp_path / f"{name}.jsonl"))
    settings = McpSettings(
        api_key=f"{name}-key",
        mount_path="/mcp",
        server_name=name,
        allowed_hosts=("testserver",),
    )
    return create_app(settings, todo_service=service), service


def test_each_app_keeps_its_own_service(tmp_path: Path) -> None:
    """以前はモジュールグローバルを上書きしていたため、後から作ったアプリに漏れていた。"""
    first_app, first_service = build_app(tmp_path, "first")
    second_app, second_service = build_app(tmp_path, "second")

    first_service.create_todo(TodoCreate(title="first だけの Todo"))

    with TestClient(first_app) as first_client, TestClient(second_app) as second_client:
        assert [todo["title"] for todo in first_client.get("/api/todos").json()] == [
            "first だけの Todo"
        ]
        assert second_client.get("/api/todos").json() == []

    assert second_service.list_todos() == []


def test_the_service_is_reachable_from_the_app_state(tmp_path: Path) -> None:
    app, service = build_app(tmp_path, "stateful")

    assert app.state.todo_service is service


def test_mcp_and_web_api_share_one_service(tmp_path: Path) -> None:
    app, service = build_app(tmp_path, "shared")
    service.create_todo(TodoCreate(title="service から作成"))

    with TestClient(app) as client:
        response = client.post(
            "/mcp/",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": "render_todo_tree", "arguments": {}},
            },
            headers={
                "Accept": "application/json, text/event-stream",
                "Content-Type": "application/json",
                "Authorization": "Bearer shared-key",
            },
        )

    assert response.status_code == 200
    assert "service から作成" in response.text
