from __future__ import annotations

import secrets

from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

BEARER_PREFIX = "bearer "
API_KEY_HEADER = "x-api-key"


class ApiKeyMiddleware:
    """MCP エンドポイントを共有キーで保護する ASGI ミドルウェア。

    `Authorization: Bearer <key>` と `X-API-Key: <key>` のどちらでも受け付ける。
    """

    def __init__(self, app: ASGIApp, api_key: str) -> None:
        self.app = app
        self.api_key = api_key

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        presented_key = extract_api_key(Headers(scope=scope))
        if presented_key is None or not secrets.compare_digest(presented_key, self.api_key):
            response = JSONResponse(
                {"error": "unauthorized", "detail": "A valid MCP API key is required."},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)


def extract_api_key(headers: Headers) -> str | None:
    authorization = headers.get("authorization")
    if authorization and authorization.lower().startswith(BEARER_PREFIX):
        return authorization[len(BEARER_PREFIX) :].strip() or None

    return headers.get(API_KEY_HEADER) or None
