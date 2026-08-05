"""MCP 仕様準拠の OAuth 2.0 フローのテスト。

Claude アプリ・ChatGPT のコネクタが辿る一連の流れをそのまま再現する:
メタデータ発見 → 動的クライアント登録 → 認可（承認画面で API キー入力）→
PKCE 付きトークン交換 → Bearer トークンで MCP を呼ぶ。
"""

from __future__ import annotations

import base64
import hashlib
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from tests.conftest import TEST_API_KEY

CALLBACK_URL = "http://localhost:33418/callback"
CODE_VERIFIER = "test-code-verifier-with-plenty-of-entropy-0123456789"
CODE_CHALLENGE = (
    base64.urlsafe_b64encode(hashlib.sha256(CODE_VERIFIER.encode()).digest())
    .decode()
    .rstrip("=")
)

MCP_HEADERS = {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
}
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


def register_client(client: TestClient) -> str:
    """動的クライアント登録をして client_id を返す。"""
    response = client.post(
        "/register",
        json={
            "client_name": "Claude",
            "redirect_uris": [CALLBACK_URL],
            "token_endpoint_auth_method": "none",
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["client_id"]


def request_authorization(client: TestClient, client_id: str, state: str = "xyz") -> str:
    """/authorize を叩き、リダイレクト先の承認画面 URL（パス+クエリ）を返す。"""
    response = client.get(
        "/authorize",
        params={
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": CALLBACK_URL,
            "state": state,
            "code_challenge": CODE_CHALLENGE,
            "code_challenge_method": "S256",
        },
        follow_redirects=False,
    )
    assert response.status_code in (302, 307), response.text
    location = response.headers["Location"]
    assert "/oauth/consent?txn=" in location
    parsed = urlparse(location)
    return f"{parsed.path}?{parsed.query}"


def approve(client: TestClient, consent_url: str, api_key: str = TEST_API_KEY) -> str:
    """承認画面で API キーを入力し、認可コードを取り出す。"""
    transaction_id = parse_qs(urlparse(consent_url).query)["txn"][0]
    response = client.post(
        "/oauth/consent",
        data={"txn": transaction_id, "api_key": api_key},
        follow_redirects=False,
    )
    assert response.status_code == 303, response.text
    redirect = urlparse(response.headers["Location"])
    assert redirect.netloc == urlparse(CALLBACK_URL).netloc
    query = parse_qs(redirect.query)
    assert query["state"] == ["xyz"]
    return query["code"][0]


def exchange_code(client: TestClient, client_id: str, code: str) -> dict:
    response = client.post(
        "/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": CALLBACK_URL,
            "client_id": client_id,
            "code_verifier": CODE_VERIFIER,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def obtain_token(client: TestClient) -> dict:
    client_id = register_client(client)
    consent_url = request_authorization(client, client_id)
    code = approve(client, consent_url)
    token = exchange_code(client, client_id, code)
    token["client_id"] = client_id
    return token


class TestMetadataDiscovery:
    def test_protected_resource_metadata_points_to_the_authorization_server(
        self, client: TestClient
    ) -> None:
        body = client.get("/.well-known/oauth-protected-resource/mcp").json()

        assert body["resource"] == "http://127.0.0.1:8000/mcp"
        assert body["authorization_servers"] == ["http://127.0.0.1:8000"]

    def test_authorization_server_metadata_lists_the_endpoints(self, client: TestClient) -> None:
        body = client.get("/.well-known/oauth-authorization-server").json()

        assert body["issuer"] == "http://127.0.0.1:8000"
        assert body["authorization_endpoint"] == "http://127.0.0.1:8000/authorize"
        assert body["token_endpoint"] == "http://127.0.0.1:8000/token"
        assert body["registration_endpoint"] == "http://127.0.0.1:8000/register"
        assert "S256" in body["code_challenge_methods_supported"]


class TestOAuthFlow:
    def test_the_full_flow_yields_a_working_bearer_token(self, client: TestClient) -> None:
        token = obtain_token(client)

        assert token["token_type"] == "Bearer"
        response = client.post(
            "/mcp/",
            json=INITIALIZE,
            headers={**MCP_HEADERS, "Authorization": f"Bearer {token['access_token']}"},
        )
        assert response.status_code == 200
        assert "todo-app" in response.text

    def test_the_consent_page_shows_the_client_name(self, client: TestClient) -> None:
        client_id = register_client(client)
        consent_url = request_authorization(client, client_id)

        response = client.get(consent_url)

        assert response.status_code == 200
        assert "Claude" in response.text
        assert "API キー" in response.text

    def test_a_wrong_api_key_is_rejected_and_can_be_retried(self, client: TestClient) -> None:
        client_id = register_client(client)
        consent_url = request_authorization(client, client_id)
        transaction_id = parse_qs(urlparse(consent_url).query)["txn"][0]

        rejected = client.post(
            "/oauth/consent",
            data={"txn": transaction_id, "api_key": "wrong-key"},
            follow_redirects=False,
        )

        assert rejected.status_code == 401
        assert "正しくありません" in rejected.text
        # 同じトランザクションで正しいキーならやり直せる
        assert approve(client, consent_url)

    def test_an_authorization_code_is_single_use(self, client: TestClient) -> None:
        client_id = register_client(client)
        code = approve(client, request_authorization(client, client_id))
        exchange_code(client, client_id, code)

        second = client.post(
            "/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": CALLBACK_URL,
                "client_id": client_id,
                "code_verifier": CODE_VERIFIER,
            },
        )

        assert second.status_code == 400

    def test_a_wrong_code_verifier_is_rejected(self, client: TestClient) -> None:
        client_id = register_client(client)
        code = approve(client, request_authorization(client, client_id))

        response = client.post(
            "/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": CALLBACK_URL,
                "client_id": client_id,
                "code_verifier": "not-the-right-verifier-but-long-enough-000000",
            },
        )

        assert response.status_code == 400

    def test_refresh_rotates_both_tokens(self, client: TestClient) -> None:
        token = obtain_token(client)

        refreshed = client.post(
            "/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": token["refresh_token"],
                "client_id": token["client_id"],
            },
        ).json()

        assert refreshed["access_token"] != token["access_token"]
        # 旧アクセストークンは失効している
        response = client.post(
            "/mcp/",
            json=INITIALIZE,
            headers={**MCP_HEADERS, "Authorization": f"Bearer {token['access_token']}"},
        )
        assert response.status_code == 401
        # 新トークンは使える
        response = client.post(
            "/mcp/",
            json=INITIALIZE,
            headers={**MCP_HEADERS, "Authorization": f"Bearer {refreshed['access_token']}"},
        )
        assert response.status_code == 200

    def test_revoked_tokens_stop_working(self, client: TestClient) -> None:
        """失効は client_secret による認証が要るので、confidential クライアントで確認する。"""
        registered = client.post(
            "/register",
            json={
                "client_name": "Confidential",
                "redirect_uris": [CALLBACK_URL],
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
            },
        ).json()
        client_id = registered["client_id"]
        client_secret = registered["client_secret"]
        code = approve(client, request_authorization(client, client_id))
        token = client.post(
            "/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": CALLBACK_URL,
                "client_id": client_id,
                "client_secret": client_secret,
                "code_verifier": CODE_VERIFIER,
            },
        ).json()

        revoke = client.post(
            "/revoke",
            data={
                "token": token["access_token"],
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )
        assert revoke.status_code == 200

        response = client.post(
            "/mcp/",
            json=INITIALIZE,
            headers={**MCP_HEADERS, "Authorization": f"Bearer {token['access_token']}"},
        )
        assert response.status_code == 401

    def test_an_expired_consent_transaction_is_rejected(self, client: TestClient) -> None:
        response = client.get("/oauth/consent", params={"txn": "unknown-transaction"})

        assert response.status_code == 400
        assert "無効" in response.text

    def test_an_invalid_transaction_does_not_reveal_whether_the_key_was_right(
        self, client: TestClient
    ) -> None:
        """無効なリクエストからキーの正誤を推測できないよう、txn を先に検証する。"""
        with_wrong_key = client.post(
            "/oauth/consent", data={"txn": "unknown", "api_key": "wrong"}, follow_redirects=False
        )
        with_right_key = client.post(
            "/oauth/consent",
            data={"txn": "unknown", "api_key": TEST_API_KEY},
            follow_redirects=False,
        )

        assert with_wrong_key.status_code == with_right_key.status_code == 400
        assert "無効" in with_wrong_key.text and "無効" in with_right_key.text

    def test_the_consent_page_cannot_be_framed(self, client: TestClient) -> None:
        """クリックジャッキングで承認を騙し取られないようにする。"""
        client_id = register_client(client)
        consent_url = request_authorization(client, client_id)

        response = client.get(consent_url)

        assert response.headers["X-Frame-Options"] == "DENY"
        assert response.headers["Content-Security-Policy"] == "frame-ancestors 'none'"
