"""SSE エンドポイントのエンドツーエンドテスト。

TestClient はレスポンスを最後までバッファするため、終わらない SSE を
購読できない。ここでは uvicorn を実際に立てて本物の HTTP 経由で確かめる。
（ジェネレータ単体の挙動は test_todo_events.py にある。）
"""

import json
import threading
import time

import httpx
import pytest
import uvicorn

from core.services.todo_service import TodoService
from interfaces.mcp.config import McpSettings
from interfaces.webapi.app import create_app


@pytest.fixture
def live_server(service: TodoService, mcp_settings: McpSettings):
    config = uvicorn.Config(
        create_app(mcp_settings, todo_service=service),
        host="127.0.0.1",
        port=0,  # 空いているポートを OS に選ばせる
        log_level="warning",
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    deadline = time.monotonic() + 5.0
    while not server.started:
        if time.monotonic() > deadline:
            raise RuntimeError("uvicorn が起動しなかった")
        time.sleep(0.01)

    port = server.servers[0].sockets[0].getsockname()[1]
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        thread.join(timeout=5.0)


def test_events_stream_notifies_on_create(live_server: str) -> None:
    """購読中に POST /api/todos すると todos_changed が流れてくる。

    ストリームを読んでいる間このスレッドは塞がるので、作成は別スレッドで行う。
    """
    def create_later() -> None:
        httpx.post(
            f"{live_server}/api/todos",
            json={"title": "pushed", "type": "product"},
            timeout=5.0,
        )

    timer = threading.Timer(0.2, create_later)
    timer.start()
    try:
        with httpx.stream("GET", f"{live_server}/api/todos/events", timeout=10.0) as response:
            assert response.status_code == 200
            assert response.headers["content-type"].startswith("text/event-stream")

            event_name = None
            for line in response.iter_lines():
                if line.startswith("event:"):
                    event_name = line.removeprefix("event:").strip()
                if line.startswith("data:"):
                    payload = json.loads(line.removeprefix("data:"))
                    assert event_name == "todos_changed"
                    assert payload["action"] == "created"
                    # POST のレスポンスとは競合し得るので、一覧から id を確かめる。
                    todos = httpx.get(f"{live_server}/api/todos", timeout=5.0).json()
                    assert payload["ids"] == [todos[0]["id"]]
                    return
            raise AssertionError("todos_changed が届かなかった")
    finally:
        timer.cancel()
