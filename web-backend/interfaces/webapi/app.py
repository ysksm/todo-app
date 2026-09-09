from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from pydantic import AnyHttpUrl, ConfigDict, TypeAdapter
from starlette.responses import RedirectResponse
from starlette.routing import Route

from mcp.server.auth.routes import (
    build_resource_metadata_url,
    create_auth_routes,
    create_protected_resource_routes,
)
from mcp.server.auth.settings import ClientRegistrationOptions, RevocationOptions
from mcp.server.transport_security import TransportSecuritySettings

from core.repositories.factory import create_todo_repository
from core.services.todo_service import TodoService
from interfaces.mcp.auth import McpAuthMiddleware
from interfaces.mcp.config import McpSettings, load_mcp_settings
from interfaces.mcp.oauth import TodoOAuthProvider
from interfaces.mcp.server import create_mcp_server
from interfaces.webapi import events, todos
from interfaces.webapi.dependencies import STATE_ATTRIBUTE
from interfaces.webapi.error_handlers import register_error_handlers
from interfaces.webapi.mcp_info import create_mcp_info_router
from interfaces.webapi.oauth_consent import create_consent_router

FRONTEND_DIST = Path(__file__).parent.parent.parent.parent / "web-frontend" / "dist"

# RFC 8414 の issuer は文字列の完全一致で比較されるので、パス無し URL に
# 余計な末尾スラッシュが付かないよう保って検証する。
_URL_ADAPTER = TypeAdapter(AnyHttpUrl, config=ConfigDict(url_preserve_empty_path=True))


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
    service = todo_service or TodoService(create_todo_repository())

    public_url = settings.resolve_public_url()
    issuer_url = _URL_ADAPTER.validate_python(public_url)
    resource_url = _URL_ADAPTER.validate_python(f"{public_url}{settings.mount_path}")

    mcp_server = create_mcp_server(service, name=settings.server_name)
    # session_manager は streamable_http_app() の初回呼び出しで作られるので、
    # lifespan で使う前にここで組み立てておく。
    # allowed_hosts を渡すと DNS リバインディング対策の許可ホストを差し替える
    # （未指定なら SDK が localhost 系だけを許可する）。
    mcp_asgi_app = mcp_server.streamable_http_app(
        streamable_http_path="/",
        stateless_http=True,
        transport_security=(
            TransportSecuritySettings(
                allowed_hosts=list(settings.allowed_hosts),
                allowed_origins=list(settings.allowed_hosts),
            )
            if settings.allowed_hosts
            else None
        ),
    )

    # MCP 仕様準拠の OAuth（承認画面で API キーを入力して許可する）。
    oauth_provider = TodoOAuthProvider(
        api_key=settings.api_key,
        public_url=public_url,
        store_file=settings.oauth_store_file,
    )

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
    app.include_router(create_consent_router(oauth_provider))

    # OAuth のエンドポイント（RFC 8414 のメタデータ / authorize / token / register /
    # revoke）と、RFC 9728 の保護リソースメタデータ。標準どおりルート直下に置く。
    app.router.routes.extend(
        create_auth_routes(
            provider=oauth_provider,
            issuer_url=issuer_url,
            client_registration_options=ClientRegistrationOptions(enabled=True),
            revocation_options=RevocationOptions(enabled=True),
        )
    )
    app.router.routes.extend(
        create_protected_resource_routes(
            resource_url=resource_url,
            authorization_servers=[issuer_url],
            resource_name=settings.server_name,
        )
    )

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
    app.mount(
        settings.mount_path,
        McpAuthMiddleware(
            mcp_asgi_app,
            api_key=settings.api_key,
            token_loader=oauth_provider.load_access_token,
            resource_metadata_url=str(build_resource_metadata_url(resource_url)),
        ),
    )

    # フロントエンドが未ビルドでも API と MCP だけで起動できるようにする。
    if FRONTEND_DIST.is_dir():
        app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="static")

    return app


def _redirect_to_mcp(mount_path: str):
    async def redirect(request: Request) -> RedirectResponse:
        query = request.url.query
        target = f"{mount_path}/{f'?{query}' if query else ''}"
        return RedirectResponse(target, status_code=307)

    return redirect
