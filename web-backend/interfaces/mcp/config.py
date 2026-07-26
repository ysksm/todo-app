from __future__ import annotations

import os
import secrets
from dataclasses import dataclass
from pathlib import Path

DEFAULT_KEY_FILE = Path(__file__).parent.parent.parent / "data" / "mcp_api_key"
DEFAULT_MOUNT_PATH = "/mcp"
DEFAULT_SERVER_NAME = "todo-app"


@dataclass(frozen=True)
class McpSettings:
    api_key: str
    mount_path: str = DEFAULT_MOUNT_PATH
    server_name: str = DEFAULT_SERVER_NAME
    allowed_hosts: tuple[str, ...] = ()
    """DNS リバインディング対策で許可する Host。空なら SDK の既定（localhost のみ）。"""


def load_mcp_settings(key_file: Path | None = None) -> McpSettings:
    return McpSettings(
        api_key=load_api_key(key_file),
        mount_path=os.environ.get("MCP_MOUNT_PATH", DEFAULT_MOUNT_PATH),
        server_name=os.environ.get("MCP_SERVER_NAME", DEFAULT_SERVER_NAME),
        allowed_hosts=parse_allowed_hosts(os.environ.get("MCP_ALLOWED_HOSTS")),
    )


def parse_allowed_hosts(value: str | None) -> tuple[str, ...]:
    if not value:
        return ()
    return tuple(host.strip() for host in value.split(",") if host.strip())


def load_api_key(key_file: Path | None = None) -> str:
    """MCP の認証キーを決める。

    優先順位は MCP_API_KEY 環境変数 > キーファイル > 新規生成。
    生成した場合はファイルへ保存するので、再起動しても同じキーを使える。
    """
    configured_key = os.environ.get("MCP_API_KEY")
    if configured_key:
        return configured_key

    path = key_file or Path(os.environ.get("MCP_API_KEY_FILE") or DEFAULT_KEY_FILE)
    if path.exists():
        stored_key = path.read_text(encoding="utf-8").strip()
        if stored_key:
            return stored_key

    generated_key = secrets.token_urlsafe(32)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{generated_key}\n", encoding="utf-8")
    path.chmod(0o600)
    return generated_key
