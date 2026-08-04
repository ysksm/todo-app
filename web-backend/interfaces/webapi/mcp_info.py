from __future__ import annotations

import ipaddress
import json

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from interfaces.mcp.config import McpSettings
from interfaces.mcp.persist_env import persist_env

KEY_PLACEHOLDER = "$MCP_API_KEY"


class McpConnection(BaseModel):
    server_name: str
    url: str
    header_name: str
    """認証キーを載せるヘッダー名。"""
    api_key: str | None
    """ローカルからの参照時のみ実際のキー。それ以外は None。"""
    is_local_request: bool
    add_command: str
    """Claude Code に登録するコマンド。"""
    client_config: str
    """他の MCP クライアント向けの設定 JSON。"""
    connector_url: str
    """Claude アプリ・ChatGPT のコネクタ用 URL。

    URL を登録すると OAuth の認可フローが始まり、承認画面で API キーを
    入力して許可する。URL 自体にキーは含まれない。
    """
    codex_config: str
    """Codex 向けの ~/.codex/config.toml スニペット。キーは環境変数で渡す。"""
    codex_env_command: str
    """Codex がキーを読む環境変数を設定するコマンド。"""
    note: str | None


class PersistEnvResponse(BaseModel):
    """POST /api/mcp/persist-env の結果。"""

    env_var: str
    zshrc_path: str
    zshrc_changed: bool
    launch_agent_path: str | None
    launch_agent_changed: bool
    launchctl_applied: bool


def create_mcp_info_router(settings: McpSettings) -> APIRouter:
    router = APIRouter(prefix="/api/mcp", tags=["mcp"])

    @router.get("/connection", response_model=McpConnection)
    def get_connection(request: Request) -> McpConnection:
        """MCP クライアントを登録するための接続情報を返す。

        認証キーはローカルからの要求にだけ返す。このエンドポイント自体は
        認証していないので、外部に開いた状態でキーを配らないようにするため。
        """
        is_local = is_loopback_client(request)
        base_url = settings.public_url or str(request.base_url).rstrip("/")
        url = f"{base_url}{settings.mount_path}"
        key = settings.api_key if is_local else KEY_PLACEHOLDER

        return McpConnection(
            server_name=settings.server_name,
            url=url,
            header_name="Authorization",
            api_key=settings.api_key if is_local else None,
            is_local_request=is_local,
            add_command=build_add_command(settings.server_name, url, key),
            client_config=build_client_config(settings.server_name, url, key),
            connector_url=url,
            codex_config=build_codex_config(settings.server_name, url),
            codex_env_command=build_codex_env_command(key),
            note=None
            if is_local
            else "認証キーはローカルからの参照時のみ表示されます。"
            "サーバー上の data/mcp_api_key を確認してください。",
        )

    @router.post("/persist-env", response_model=PersistEnvResponse)
    def persist_env_endpoint(request: Request) -> PersistEnvResponse:
        """キーの環境変数を ~/.zshrc と LaunchAgent に永続化する。

        サーバーが動いているマシンのファイルを書き換えるので、
        ローカル（loopback）からの要求に限る。
        """
        if not is_loopback_client(request):
            raise HTTPException(
                status_code=403, detail="This operation is only available from localhost"
            )

        result = persist_env(settings.api_key, env_var=CODEX_TOKEN_ENV_VAR)
        return PersistEnvResponse(
            env_var=result.env_var,
            zshrc_path=result.zshrc_path,
            zshrc_changed=result.zshrc_changed,
            launch_agent_path=result.launch_agent_path,
            launch_agent_changed=result.launch_agent_changed,
            launchctl_applied=result.launchctl_applied,
        )

    return router


def build_add_command(server_name: str, url: str, api_key: str) -> str:
    return (
        f"claude mcp add --transport http {server_name} {url} "
        f'--header "Authorization: Bearer {api_key}"'
    )


#: Codex が Bearer トークンを読む環境変数名。
CODEX_TOKEN_ENV_VAR = "TODO_APP_MCP_TOKEN"


def build_codex_config(server_name: str, url: str) -> str:
    """Codex の設定スニペット。キーは環境変数経由で Bearer トークンとして送られる。"""
    return (
        f"[mcp_servers.{server_name}]\n"
        f'url = "{url}"\n'
        f'bearer_token_env_var = "{CODEX_TOKEN_ENV_VAR}"\n'
    )


def build_codex_env_command(api_key: str) -> str:
    """キーを環境変数に載せるコマンド。

    launchctl setenv は GUI アプリ（ChatGPT アプリの Codex など）向け、
    export はターミナルから使う Codex CLI 向け。
    """
    return (
        f"launchctl setenv {CODEX_TOKEN_ENV_VAR} '{api_key}'\n"
        f"export {CODEX_TOKEN_ENV_VAR}='{api_key}'"
    )


def build_client_config(server_name: str, url: str, api_key: str) -> str:
    return json.dumps(
        {
            "mcpServers": {
                server_name: {
                    "type": "http",
                    "url": url,
                    "headers": {"Authorization": f"Bearer {api_key}"},
                }
            }
        },
        indent=2,
        ensure_ascii=False,
    )


def is_loopback_client(request: Request) -> bool:
    host = request.client.host if request.client else None
    if not host:
        return False
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        # TestClient などホスト名で来る場合がある。
        return host == "localhost" or host == "testclient"
