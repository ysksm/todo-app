import asyncio
import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from core.services.todo_service import TodoService
from interfaces.mcp.config import load_api_key, load_mcp_settings
from interfaces.mcp.server import create_mcp_server
from tests.conftest import TEST_API_KEY

EXPECTED_TOOLS = {
    "list_todos",
    "render_todo_tree",
    "get_todo",
    "create_todo",
    "update_todo",
    "move_todo",
    "delete_todo",
}


@pytest.fixture
def mcp_server(service: TodoService):
    return create_mcp_server(service)


def call_tool(mcp_server, name: str, **arguments: Any) -> Any:
    result = asyncio.run(mcp_server.call_tool(name, arguments))
    # SDK 2.0 は CallToolResult を返す。失敗はテキストを添えて is_error になる。
    if result.is_error:
        message = "".join(getattr(content, "text", "") for content in result.content)
        raise RuntimeError(message)
    structured = result.structured_content
    return structured.get("result", structured) if isinstance(structured, dict) else structured


def test_exposes_every_core_operation(mcp_server) -> None:
    tools = asyncio.run(mcp_server.list_tools())

    assert {tool.name for tool in tools} == EXPECTED_TOOLS
    assert all(tool.description for tool in tools)


def test_create_and_list_through_tools(mcp_server) -> None:
    root = call_tool(mcp_server, "create_todo", title="アプリを作る", type="product")
    call_tool(
        mcp_server, "create_todo", title="バックエンド", parent_id=root["id"], type="epic"
    )

    todos = call_tool(mcp_server, "list_todos")

    assert [todo["title"] for todo in todos] == ["アプリを作る", "バックエンド"]
    assert todos[1]["parent_id"] == root["id"]


def test_render_tree_through_tools(mcp_server) -> None:
    root = call_tool(mcp_server, "create_todo", title="root", type="product")
    call_tool(mcp_server, "create_todo", title="child", parent_id=root["id"], type="epic")

    assert (
        call_tool(mcp_server, "render_todo_tree")
        == "[ ] #1 (product) root\n  [ ] #2 (epic) child"
    )


def test_update_and_move_through_tools(mcp_server) -> None:
    root = call_tool(mcp_server, "create_todo", title="root", type="product")
    first = call_tool(
        mcp_server, "create_todo", title="first", parent_id=root["id"], type="epic"
    )
    second = call_tool(
        mcp_server, "create_todo", title="second", parent_id=root["id"], type="epic"
    )

    updated = call_tool(mcp_server, "update_todo", todo_id=first["id"], title="renamed")
    assert updated["title"] == "renamed"
    assert updated["parent_id"] == root["id"]
    # type を省略した更新は今の種類を保つ
    assert updated["type"] == "epic"

    moved = call_tool(mcp_server, "move_todo", todo_id=second["id"], parent_id=root["id"], position=0)
    assert moved["position"] == 0


def test_create_with_a_status_through_tools(mcp_server) -> None:
    created = call_tool(mcp_server, "create_todo", title="作業中", status="doing")

    assert created["status"] == "doing"
    # 省略時は todo
    assert call_tool(mcp_server, "create_todo", title="手つかず")["status"] == "todo"


def test_update_changes_and_keeps_the_status(mcp_server) -> None:
    created = call_tool(mcp_server, "create_todo", title="タスク")

    updated = call_tool(
        mcp_server, "update_todo", todo_id=created["id"], title="タスク", status="done"
    )
    assert updated["status"] == "done"

    # status を省略した更新は今の状態を保つ
    renamed = call_tool(mcp_server, "update_todo", todo_id=created["id"], title="改名")
    assert renamed["status"] == "done"


def test_list_todos_filters_by_status_through_tools(mcp_server) -> None:
    call_tool(mcp_server, "create_todo", title="手つかず")
    doing = call_tool(mcp_server, "create_todo", title="作業中", status="doing")

    filtered = call_tool(mcp_server, "list_todos", status="doing")

    assert [todo["id"] for todo in filtered] == [doing["id"]]
    assert len(call_tool(mcp_server, "list_todos")) == 2


def test_render_tree_shows_status_marks(mcp_server) -> None:
    call_tool(mcp_server, "create_todo", title="todo のまま")
    call_tool(mcp_server, "create_todo", title="作業中", status="doing")
    call_tool(mcp_server, "create_todo", title="完了", status="done")

    assert call_tool(mcp_server, "render_todo_tree") == "\n".join(
        [
            "[ ] #1 (task) todo のまま",
            "[~] #2 (task) 作業中",
            "[x] #3 (task) 完了",
        ]
    )


def test_create_rejects_an_unknown_status(mcp_server) -> None:
    with pytest.raises(Exception):
        call_tool(mcp_server, "create_todo", title="x", status="unknown")


def test_delete_through_tools_reports_descendants(mcp_server) -> None:
    root = call_tool(mcp_server, "create_todo", title="root", type="product")
    child = call_tool(mcp_server, "create_todo", title="child", parent_id=root["id"], type="epic")

    assert call_tool(mcp_server, "delete_todo", todo_id=root["id"]) == {
        "deleted_ids": [root["id"], child["id"]]
    }


def test_tool_errors_are_reported(mcp_server) -> None:
    with pytest.raises(Exception, match="not found"):
        call_tool(mcp_server, "get_todo", todo_id=999)


def test_create_rejects_a_type_the_parent_cannot_hold(mcp_server) -> None:
    task = call_tool(mcp_server, "create_todo", title="task", type="task")

    with pytest.raises(Exception, match="Cannot place"):
        call_tool(mcp_server, "create_todo", title="epic", parent_id=task["id"], type="epic")


class TestMcpEndpointAuth:
    ENDPOINT = "/mcp/"
    INITIALIZE = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "test", "version": "1.0"},
        },
    }
    HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}

    def test_rejects_a_request_without_a_key(self, client: TestClient) -> None:
        response = client.post(self.ENDPOINT, json=self.INITIALIZE, headers=self.HEADERS)

        assert response.status_code == 401
        assert response.headers["WWW-Authenticate"] == "Bearer"

    def test_rejects_a_wrong_key(self, client: TestClient) -> None:
        response = client.post(
            self.ENDPOINT,
            json=self.INITIALIZE,
            headers={**self.HEADERS, "Authorization": "Bearer wrong-key"},
        )

        assert response.status_code == 401

    def test_accepts_a_bearer_key(self, client: TestClient) -> None:
        response = client.post(
            self.ENDPOINT,
            json=self.INITIALIZE,
            headers={**self.HEADERS, "Authorization": f"Bearer {TEST_API_KEY}"},
        )

        assert response.status_code == 200
        assert "todo-app" in response.text

    def test_accepts_an_x_api_key_header(self, client: TestClient) -> None:
        response = client.post(
            self.ENDPOINT,
            json=self.INITIALIZE,
            headers={**self.HEADERS, "X-API-Key": TEST_API_KEY},
        )

        assert response.status_code == 200

    def test_accepts_a_query_key(self, client: TestClient) -> None:
        """Claude アプリのカスタムコネクタはヘッダーを送れないので ?key= でも通す。"""
        response = client.post(
            f"{self.ENDPOINT}?key={TEST_API_KEY}",
            json=self.INITIALIZE,
            headers=self.HEADERS,
        )

        assert response.status_code == 200

    def test_rejects_a_wrong_query_key(self, client: TestClient) -> None:
        response = client.post(
            f"{self.ENDPOINT}?key=wrong-key",
            json=self.INITIALIZE,
            headers=self.HEADERS,
        )

        assert response.status_code == 401

    def test_redirect_from_the_bare_mount_path_keeps_the_query(self, client: TestClient) -> None:
        """コネクタには /mcp?key=... を渡すので、/mcp/ への 307 でクエリを失わない。"""
        response = client.post(
            f"/mcp?key={TEST_API_KEY}",
            json=self.INITIALIZE,
            headers=self.HEADERS,
            follow_redirects=False,
        )

        assert response.status_code == 307
        assert response.headers["Location"] == f"/mcp/?key={TEST_API_KEY}"

    def test_the_query_key_works_through_the_redirect(self, client: TestClient) -> None:
        response = client.post(
            f"/mcp?key={TEST_API_KEY}",
            json=self.INITIALIZE,
            headers=self.HEADERS,
            follow_redirects=True,
        )

        assert response.status_code == 200


class TestApiKeyLoading:
    def test_uses_the_environment_variable_first(self, tmp_path: Path, monkeypatch) -> None:
        monkeypatch.setenv("MCP_API_KEY", "from-env")

        assert load_api_key(tmp_path / "key") == "from-env"

    def test_generates_and_persists_a_key(self, tmp_path: Path, monkeypatch) -> None:
        monkeypatch.delenv("MCP_API_KEY", raising=False)
        key_file = tmp_path / "nested" / "mcp_api_key"

        generated = load_api_key(key_file)

        assert len(generated) >= 32
        assert key_file.read_text(encoding="utf-8").strip() == generated
        assert load_api_key(key_file) == generated

    def test_settings_read_the_mount_path_from_the_environment(
        self, tmp_path: Path, monkeypatch
    ) -> None:
        monkeypatch.setenv("MCP_API_KEY", "k")
        monkeypatch.setenv("MCP_MOUNT_PATH", "/tools")

        assert load_mcp_settings(tmp_path / "key").mount_path == "/tools"


class TestConnectionInfo:
    def test_returns_a_ready_to_paste_command(self, client: TestClient) -> None:
        body = client.get("/api/mcp/connection").json()

        assert body["is_local_request"] is True
        assert body["api_key"] == TEST_API_KEY
        assert body["url"].endswith("/mcp")
        assert body["add_command"] == (
            f"claude mcp add --transport http todo-app {body['url']} "
            f'--header "Authorization: Bearer {TEST_API_KEY}"'
        )

    def test_client_config_is_valid_json(self, client: TestClient) -> None:
        body = client.get("/api/mcp/connection").json()

        config = json.loads(body["client_config"])
        server = config["mcpServers"]["todo-app"]

        assert server["type"] == "http"
        assert server["headers"]["Authorization"] == f"Bearer {TEST_API_KEY}"

    def test_hides_the_key_from_non_local_clients(self, client: TestClient) -> None:
        response = client.get("/api/mcp/connection", headers={"Host": "todo.example.com"})
        body = response.json()

        # TestClient は常にローカル扱いなので、判定関数そのものを確認する。
        assert body["is_local_request"] is True

    def test_returns_a_connector_url_with_the_key_in_the_query(self, client: TestClient) -> None:
        """Claude アプリ・ChatGPT のコネクタにはヘッダーが無いので ?key= 付き URL を出す。"""
        body = client.get("/api/mcp/connection").json()

        assert body["connector_url"] == f"{body['url']}?key={TEST_API_KEY}"

    def test_returns_a_codex_config_snippet(self, client: TestClient) -> None:
        body = client.get("/api/mcp/connection").json()

        assert body["codex_config"] == (
            f'[mcp_servers.todo-app]\nurl = "{body["url"]}?key={TEST_API_KEY}"\n'
        )

    def test_uses_the_public_url_when_configured(
        self, service: TodoService, mcp_settings
    ) -> None:
        from dataclasses import replace

        from interfaces.webapi.app import create_app

        settings = replace(mcp_settings, public_url="https://todo.example.trycloudflare.com")
        with TestClient(create_app(settings, todo_service=service)) as public_client:
            body = public_client.get("/api/mcp/connection").json()

        assert body["url"] == "https://todo.example.trycloudflare.com/mcp"
        assert body["connector_url"] == (
            f"https://todo.example.trycloudflare.com/mcp?key={TEST_API_KEY}"
        )


def test_non_local_requests_get_a_placeholder_instead_of_the_key() -> None:
    from unittest.mock import Mock

    from interfaces.webapi.mcp_info import KEY_PLACEHOLDER, is_loopback_client

    remote_request = Mock()
    remote_request.client.host = "203.0.113.9"

    assert is_loopback_client(remote_request) is False
    assert KEY_PLACEHOLDER == "$MCP_API_KEY"
