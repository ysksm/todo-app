"""MCP API キーの環境変数を永続化する。

Codex（ChatGPT アプリ）は Bearer トークンを環境変数（TODO_APP_MCP_TOKEN）から
読むが、launchctl setenv や export は再起動・シェル終了で消えてしまう。
ここでは次の 3 つをまとめて行い、再起動後もキーが見えるようにする:

1. ~/.zshrc にマーカー付きの export 行を追記・更新（ターミナル用）
2. ~/Library/LaunchAgents に、ログイン時へ launchctl setenv を実行する
   LaunchAgent を登録（GUI アプリ用。macOS のみ）
3. launchctl setenv を即時実行（再起動を待たずに GUI アプリへ反映。macOS のみ）

どれも冪等で、キーが変わったら同じ操作でブロックごと書き換わる。
"""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from xml.sax.saxutils import escape

ZSHRC_BEGIN = "# >>> todo-app MCP key >>>"
ZSHRC_END = "# <<< todo-app MCP key <<<"
LAUNCH_AGENT_LABEL = "com.todo-app.mcp-env"


@dataclass(frozen=True)
class PersistEnvResult:
    env_var: str
    zshrc_path: str
    zshrc_changed: bool
    """False なら既に同じ内容で設定済み。"""
    launch_agent_path: str | None
    """macOS 以外では None。"""
    launch_agent_changed: bool
    launchctl_applied: bool
    """launchctl setenv を即時実行できたか（macOS のみ true になりうる）。"""


def persist_env(api_key: str, env_var: str, home: Path | None = None) -> PersistEnvResult:
    home = home or Path.home()
    is_macos = sys.platform == "darwin"

    zshrc_path = home / ".zshrc"
    zshrc_changed = _upsert_marked_block(
        zshrc_path,
        f"{ZSHRC_BEGIN}\nexport {env_var}='{api_key}'\n{ZSHRC_END}\n",
    )

    launch_agent_path: Path | None = None
    launch_agent_changed = False
    if is_macos:
        launch_agent_path = home / "Library" / "LaunchAgents" / f"{LAUNCH_AGENT_LABEL}.plist"
        launch_agent_changed = _write_if_changed(
            launch_agent_path, _launch_agent_plist(env_var, api_key)
        )

    launchctl_applied = is_macos and _run_launchctl_setenv(env_var, api_key)

    return PersistEnvResult(
        env_var=env_var,
        zshrc_path=str(zshrc_path),
        zshrc_changed=zshrc_changed,
        launch_agent_path=str(launch_agent_path) if launch_agent_path else None,
        launch_agent_changed=launch_agent_changed,
        launchctl_applied=launchctl_applied,
    )


def _upsert_marked_block(path: Path, block: str) -> bool:
    """マーカーで囲んだブロックを追記・置換する。変更が無ければ False。"""
    existing = path.read_text(encoding="utf-8") if path.exists() else ""

    if ZSHRC_BEGIN in existing and ZSHRC_END in existing:
        head, _, rest = existing.partition(ZSHRC_BEGIN)
        _, _, tail = rest.partition(ZSHRC_END)
        tail = tail.lstrip("\n")
        updated = f"{head}{block}{tail}"
    elif existing:
        separator = "" if existing.endswith("\n") else "\n"
        updated = f"{existing}{separator}\n{block}"
    else:
        updated = block

    if updated == existing:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(updated, encoding="utf-8")
    path.chmod(0o600)
    return True


def _write_if_changed(path: Path, content: str) -> bool:
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    path.chmod(0o600)
    return True


def _launch_agent_plist(env_var: str, api_key: str) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/launchctl</string>
    <string>setenv</string>
    <string>{escape(env_var)}</string>
    <string>{escape(api_key)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
"""


def _run_launchctl_setenv(env_var: str, api_key: str) -> bool:  # pragma: no cover — 実機でのみ実行
    try:
        completed = subprocess.run(
            ["/bin/launchctl", "setenv", env_var, api_key],
            capture_output=True,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return completed.returncode == 0
