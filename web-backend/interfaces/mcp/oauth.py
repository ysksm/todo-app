"""MCP 仕様準拠の OAuth 2.0 認可サーバー実装。

Claude アプリや ChatGPT のコネクタはカスタムヘッダーを送れないため、
MCP の認可仕様（OAuth 2.0 / PKCE / Dynamic Client Registration）で
Bearer トークンを発行して認証する。

- 認可エンドポイント等のルートは SDK の create_auth_routes が生成し、
  このモジュールの TodoOAuthProvider がその裏側を実装する
- 資源所有者の認証は承認画面（/oauth/consent）で MCP API キーを入力する方式。
  キーを知っている人だけがクライアントにアクセスを許可できる
- uvicorn --reload の再起動でも接続が切れないよう、クライアント登録と
  トークンは JSON ファイル（data/mcp_oauth.json）へ永続化する
"""

from __future__ import annotations

import json
import secrets
import threading
import time
from pathlib import Path
from typing import Any

from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    AuthorizeError,
    RefreshToken,
    TokenError,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from pydantic import AnyUrl

#: 認可コードと承認画面のトランザクションの有効期限（秒）。
CODE_TTL_SECONDS = 10 * 60
#: アクセストークンの有効期限（秒）。切れたらリフレッシュトークンで更新される。
ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60


class ConsentError(Exception):
    """承認画面の失敗。メッセージはそのまま画面に出す。"""


class TodoOAuthProvider:
    """SDK の OAuthAuthorizationServerProvider プロトコル実装。

    すべての状態を 1 つの JSON ファイルに持つ。プロセス内の排他は
    threading.Lock で行う（ファイルは MCP の認可でしか触らないので、
    todos.jsonl のようなプロセス間排他までは要らない）。
    """

    def __init__(self, api_key: str, public_url: str, store_file: Path) -> None:
        self.api_key = api_key
        self.public_url = public_url.rstrip("/")
        self.store_file = store_file
        self._lock = threading.Lock()

    # ---- Dynamic Client Registration (RFC 7591) ----

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        with self._lock:
            store = self._read()
            client = store["clients"].get(client_id)
        return OAuthClientInformationFull.model_validate(client) if client else None

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        with self._lock:
            store = self._read()
            store["clients"][client_info.client_id] = client_info.model_dump(mode="json")
            self._write(store)

    # ---- 認可（承認画面へのリダイレクト） ----

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        """認可リクエストをトランザクションとして保存し、承認画面へ飛ばす。"""
        transaction_id = secrets.token_urlsafe(32)
        with self._lock:
            store = self._read()
            store["transactions"][transaction_id] = {
                "client_id": client.client_id,
                "client_name": client.client_name,
                "state": params.state,
                "scopes": params.scopes or [],
                "code_challenge": params.code_challenge,
                "redirect_uri": str(params.redirect_uri),
                "redirect_uri_provided_explicitly": params.redirect_uri_provided_explicitly,
                "resource": params.resource,
                "expires_at": time.time() + CODE_TTL_SECONDS,
            }
            self._write(store)
        return f"{self.public_url}/oauth/consent?txn={transaction_id}"

    def transaction_client_name(self, transaction_id: str) -> str:
        """承認画面に出すクライアント名。無効なトランザクションなら ConsentError。"""
        with self._lock:
            transaction = self._read()["transactions"].get(transaction_id)
        if transaction is None or transaction["expires_at"] < time.time():
            raise ConsentError("この承認リクエストは無効か、期限切れです。クライアントから接続し直してください。")
        return transaction.get("client_name") or transaction["client_id"]

    def complete_consent(self, transaction_id: str, presented_key: str) -> str:
        """API キーを検証し、認可コードを発行してクライアントへのリダイレクト URL を返す。"""
        if not secrets.compare_digest(presented_key, self.api_key):
            raise ConsentError("API キーが正しくありません。")

        with self._lock:
            store = self._read()
            transaction = store["transactions"].pop(transaction_id, None)
            if transaction is None or transaction["expires_at"] < time.time():
                self._write(store)
                raise ConsentError(
                    "この承認リクエストは無効か、期限切れです。クライアントから接続し直してください。"
                )

            code = secrets.token_urlsafe(32)
            store["codes"][code] = {
                "client_id": transaction["client_id"],
                "scopes": transaction["scopes"],
                "code_challenge": transaction["code_challenge"],
                "redirect_uri": transaction["redirect_uri"],
                "redirect_uri_provided_explicitly": transaction["redirect_uri_provided_explicitly"],
                "resource": transaction["resource"],
                "expires_at": time.time() + CODE_TTL_SECONDS,
            }
            self._write(store)

        return construct_redirect_uri(
            transaction["redirect_uri"], code=code, state=transaction["state"]
        )

    # ---- 認可コード → トークン ----

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        with self._lock:
            code = self._read()["codes"].get(authorization_code)
        if code is None or code["client_id"] != client.client_id:
            return None
        return AuthorizationCode(
            code=authorization_code,
            scopes=code["scopes"],
            expires_at=code["expires_at"],
            client_id=code["client_id"],
            code_challenge=code["code_challenge"],
            redirect_uri=AnyUrl(code["redirect_uri"]),
            redirect_uri_provided_explicitly=code["redirect_uri_provided_explicitly"],
            resource=code["resource"],
        )

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        with self._lock:
            store = self._read()
            if store["codes"].pop(authorization_code.code, None) is None:
                raise TokenError(error="invalid_grant", error_description="Authorization code is not valid")
            token = self._issue_tokens(
                store,
                client_id=client.client_id,
                scopes=authorization_code.scopes,
                resource=authorization_code.resource,
            )
            self._write(store)
        return token

    # ---- リフレッシュトークン ----

    async def load_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: str
    ) -> RefreshToken | None:
        with self._lock:
            token = self._read()["refresh_tokens"].get(refresh_token)
        if token is None or token["client_id"] != client.client_id:
            return None
        return RefreshToken(token=refresh_token, client_id=token["client_id"], scopes=token["scopes"])

    async def exchange_refresh_token(
        self,
        client: OAuthClientInformationFull,
        refresh_token: RefreshToken,
        scopes: list[str],
    ) -> OAuthToken:
        with self._lock:
            store = self._read()
            stored = store["refresh_tokens"].pop(refresh_token.token, None)
            if stored is None:
                raise TokenError(error="invalid_grant", error_description="Refresh token is not valid")
            # 対になっていたアクセストークンも一緒にローテーションする。
            store["access_tokens"].pop(stored.get("paired_access_token", ""), None)
            token = self._issue_tokens(
                store,
                client_id=client.client_id,
                scopes=scopes or stored["scopes"],
                resource=stored.get("resource"),
            )
            self._write(store)
        return token

    # ---- Bearer トークンの検証・失効 ----

    async def load_access_token(self, token: str) -> AccessToken | None:
        with self._lock:
            stored = self._read()["access_tokens"].get(token)
        if stored is None or stored["expires_at"] < time.time():
            return None
        return AccessToken(
            token=token,
            client_id=stored["client_id"],
            scopes=stored["scopes"],
            expires_at=int(stored["expires_at"]),
            resource=stored.get("resource"),
        )

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        with self._lock:
            store = self._read()
            access = store["access_tokens"].pop(token.token, None)
            refresh = store["refresh_tokens"].pop(token.token, None)
            if access:
                store["refresh_tokens"].pop(access.get("paired_refresh_token", ""), None)
            if refresh:
                store["access_tokens"].pop(refresh.get("paired_access_token", ""), None)
            self._write(store)

    # ---- 内部 ----

    def _issue_tokens(
        self,
        store: dict[str, Any],
        client_id: str,
        scopes: list[str],
        resource: str | None,
    ) -> OAuthToken:
        """アクセストークンとリフレッシュトークンの対を発行して store に載せる。"""
        access_token = secrets.token_urlsafe(32)
        refresh_token = secrets.token_urlsafe(32)
        store["access_tokens"][access_token] = {
            "client_id": client_id,
            "scopes": scopes,
            "resource": resource,
            "expires_at": time.time() + ACCESS_TOKEN_TTL_SECONDS,
            "paired_refresh_token": refresh_token,
        }
        store["refresh_tokens"][refresh_token] = {
            "client_id": client_id,
            "scopes": scopes,
            "resource": resource,
            "paired_access_token": access_token,
        }
        return OAuthToken(
            access_token=access_token,
            token_type="Bearer",
            expires_in=ACCESS_TOKEN_TTL_SECONDS,
            scope=" ".join(scopes) if scopes else None,
            refresh_token=refresh_token,
        )

    def _read(self) -> dict[str, Any]:
        empty: dict[str, Any] = {
            "clients": {},
            "transactions": {},
            "codes": {},
            "access_tokens": {},
            "refresh_tokens": {},
        }
        if not self.store_file.exists():
            return empty
        try:
            stored = json.loads(self.store_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return empty
        return {key: stored.get(key, {}) for key in empty}

    def _write(self, store: dict[str, Any]) -> None:
        now = time.time()
        # 期限切れの一時データはこの機会に掃除する。
        for key in ("transactions", "codes", "access_tokens"):
            store[key] = {
                value_key: value
                for value_key, value in store[key].items()
                if value.get("expires_at", now + 1) >= now
            }
        self.store_file.parent.mkdir(parents=True, exist_ok=True)
        temporary_file = self.store_file.with_suffix(f"{self.store_file.suffix}.tmp")
        temporary_file.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary_file.chmod(0o600)
        temporary_file.replace(self.store_file)
