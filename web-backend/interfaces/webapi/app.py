from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from starlette.responses import RedirectResponse
from starlette.routing import Route

from core.repositories.todo_repository import TodoRepository
from core.services.todo_service import TodoService
from interfaces.mcp.auth import ApiKeyMiddleware
from interfaces.mcp.config import McpSettings, load_mcp_settings
from interfaces.mcp.server import create_mcp_server
from interfaces.webapi import events, todos
from interfaces.webapi.dependencies import STATE_ATTRIBUTE
from interfaces.webapi.error_handlers import register_error_handlers
from interfaces.webapi.mcp_info import create_mcp_info_router

FRONTEND_DIST = Path(__file__).parent.parent.parent.parent / "web-frontend" / "dist"


def create_app(
    mcp_settings: McpSettings | None = None,
    todo_service: TodoService | None = None,
) -> FastAPI:
    """HTTP のインターフェースを組み立てる。

    同じ TodoService を Web API と MCP の両方が使うので、どちらから触っても
    同じデータになる。サービスはこのアプリだけに紐付くので、同じプロセスで
    複数のアプリを作っても互いに影響しない。
    """
    settings = mcp_settings or load_mcp_settings()
    service = todo_service or TodoService(TodoRepository())

    mcp_server = create_mcp_server(
        service,
        name=settings.server_name,
        allowed_hosts=settings.allowed_hosts,
    )
    # session_manager は streamable_http_app() の初回呼び出しで作られるので、
    # lifespan で使う前にここで組み立てておく。
    mcp_asgi_app = mcp_server.streamable_http_app()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        # mount したサブアプリの lifespan は自動では走らないため、ここで回す。
        async with mcp_server.session_manager.run():
            yield

    app = FastAPI(title="TODO API", lifespan=lifespan)
    setattr(app.state, STATE_ATTRIBUTE, service)
    register_error_handlers(app)
    # "/api/todos/events" が "/api/todos/{todo_id}" に食われないよう、先に登録する。
    app.include_router(events.router)
    app.include_router(todos.router)
    app.include_router(create_mcp_info_router(settings))

    # mount は "/mcp/" にしか一致しないので、"/mcp" で来たクライアントを取りこぼさない。
    # 307 はメソッドと本文を保つので、POST の JSON-RPC もそのまま引き継がれる。
    app.router.routes.append(
        Route(
            settings.mount_path,
            _redirect_to_mcp(settings.mount_path),
            methods=["GET", "POST", "DELETE", "OPTIONS"],
            include_in_schema=False,
        )
    )
    app.mount(settings.mount_path, ApiKeyMiddleware(mcp_asgi_app, settings.api_key))

    # フロントエンドが未ビルドでも API と MCP だけで起動できるようにする。
    if FRONTEND_DIST.is_dir():
        app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="static")

    return app


def _redirect_to_mcp(mount_path: str):
    async def redirect(request: Request) -> RedirectResponse:
        # ?key=... で認証するクライアントがいるので、クエリは落とさず引き継ぐ。
        query = request.url.query
        target = f"{mount_path}/{f'?{query}' if query else ''}"
        return RedirectResponse(target, status_code=307)

    return redirect
