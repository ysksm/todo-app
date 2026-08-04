from __future__ import annotations

import secrets
from collections.abc import Awaitable, Callable

from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from mcp.server.auth.provider import AccessToken

BEARER_PREFIX = "bearer "
API_KEY_HEADER = "x-api-key"

TokenLoader = Callable[[str], Awaitable[AccessToken | None]]


class McpAuthMiddleware:
    """MCP エンドポイントを Bearer トークンで保護する ASGI ミドルウェア。

    受け付けるのは次の 2 種類。どちらも Authorization: Bearer ヘッダー
    （または X-API-Key）で送る。クエリパラメータでは受け付けない。

    - 共有 API キー（Claude Code や Codex など、ヘッダーを送れるクライアント向け）
    - OAuth で発行したアクセストークン（Claude アプリ・ChatGPT のコネクタ向け）

    未認証の 401 には RFC 9728 の resource_metadata を載せ、OAuth 対応
    クライアントが認可サーバーを発見できるようにする。
    """

    def __init__(
        self,
        app: ASGIApp,
        api_key: str,
        token_loader: TokenLoader,
        resource_metadata_url: str,
    ) -> None:
        self.app = app
        self.api_key = api_key
        self.token_loader = token_loader
        self.resource_metadata_url = resource_metadata_url

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        if await self._is_authorized(Headers(scope=scope)):
            await self.app(scope, receive, send)
            return

        response = JSONResponse(
            {"error": "unauthorized", "detail": "A valid MCP API key or OAuth token is required."},
            status_code=401,
            headers={
                "WWW-Authenticate": (
                    f'Bearer resource_metadata="{self.resource_metadata_url}"'
                )
            },
        )
        await response(scope, receive, send)

    async def _is_authorized(self, headers: Headers) -> bool:
        presented = extract_bearer_token(headers)
        if presented is None:
            return False
        if secrets.compare_digest(presented, self.api_key):
            return True
        return await self.token_loader(presented) is not None


def extract_bearer_token(headers: Headers) -> str | None:
    authorization = headers.get("authorization")
    if authorization and authorization.lower().startswith(BEARER_PREFIX):
        return authorization[len(BEARER_PREFIX) :].strip() or None

    return headers.get(API_KEY_HEADER) or None
