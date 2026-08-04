from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import interfaces.mcp.persist_env as persist_env_module
from interfaces.mcp.persist_env import LAUNCH_AGENT_LABEL, ZSHRC_BEGIN, ZSHRC_END, persist_env
from tests.conftest import TEST_API_KEY

ENV_VAR = "TODO_APP_MCP_TOKEN"


@pytest.fixture(autouse=True)
def no_real_launchctl(monkeypatch):
    """テストからは本物の launchctl を呼ばない。"""
    monkeypatch.setattr(persist_env_module, "_run_launchctl_setenv", lambda *_: True)


def read_zshrc(home: Path) -> str:
    return (home / ".zshrc").read_text(encoding="utf-8")


def test_appends_a_marked_block_to_a_fresh_zshrc(tmp_path: Path) -> None:
    result = persist_env("key-1", env_var=ENV_VAR, home=tmp_path)

    content = read_zshrc(tmp_path)
    assert result.zshrc_changed is True
    assert ZSHRC_BEGIN in content and ZSHRC_END in content
    assert f"export {ENV_VAR}='key-1'" in content


def test_keeps_existing_zshrc_content(tmp_path: Path) -> None:
    (tmp_path / ".zshrc").write_text("alias ll='ls -la'\n", encoding="utf-8")

    persist_env("key-1", env_var=ENV_VAR, home=tmp_path)

    content = read_zshrc(tmp_path)
    assert content.startswith("alias ll='ls -la'\n")
    assert f"export {ENV_VAR}='key-1'" in content


def test_is_idempotent_and_replaces_the_block_on_key_rotation(tmp_path: Path) -> None:
    persist_env("key-1", env_var=ENV_VAR, home=tmp_path)

    unchanged = persist_env("key-1", env_var=ENV_VAR, home=tmp_path)
    assert unchanged.zshrc_changed is False

    rotated = persist_env("key-2", env_var=ENV_VAR, home=tmp_path)
    content = read_zshrc(tmp_path)
    assert rotated.zshrc_changed is True
    assert "key-2" in content
    assert "key-1" not in content
    # ブロックは増殖しない
    assert content.count(ZSHRC_BEGIN) == 1


def test_writes_a_launch_agent_on_macos(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(persist_env_module.sys, "platform", "darwin")

    result = persist_env("key-1", env_var=ENV_VAR, home=tmp_path)

    plist_path = tmp_path / "Library" / "LaunchAgents" / f"{LAUNCH_AGENT_LABEL}.plist"
    assert result.launch_agent_path == str(plist_path)
    assert result.launch_agent_changed is True
    assert result.launchctl_applied is True
    plist = plist_path.read_text(encoding="utf-8")
    assert "<string>setenv</string>" in plist
    assert f"<string>{ENV_VAR}</string>" in plist
    assert "<string>key-1</string>" in plist


def test_skips_the_launch_agent_off_macos(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(persist_env_module.sys, "platform", "linux")

    result = persist_env("key-1", env_var=ENV_VAR, home=tmp_path)

    assert result.launch_agent_path is None
    assert result.launch_agent_changed is False
    assert result.launchctl_applied is False


def test_endpoint_persists_into_the_home_directory(
    client: TestClient, tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))

    response = client.post("/api/mcp/persist-env")

    assert response.status_code == 200
    body = response.json()
    assert body["env_var"] == ENV_VAR
    assert body["zshrc_changed"] is True
    assert f"export {ENV_VAR}='{TEST_API_KEY}'" in read_zshrc(tmp_path)


def test_endpoint_rejects_remote_clients(client: TestClient, monkeypatch) -> None:
    import interfaces.webapi.mcp_info as mcp_info_module

    monkeypatch.setattr(mcp_info_module, "is_loopback_client", lambda _request: False)

    response = client.post("/api/mcp/persist-env")

    assert response.status_code == 403
