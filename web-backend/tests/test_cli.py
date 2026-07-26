import json
from pathlib import Path

import pytest

from interfaces.cli.main import main


@pytest.fixture
def run_cli(tmp_path: Path, capsys):
    data_file = tmp_path / "todos.jsonl"

    def run(*args: str) -> tuple[int, str, str]:
        exit_code = main(["--data-file", str(data_file), *args])
        captured = capsys.readouterr()
        return exit_code, captured.out.strip(), captured.err.strip()

    return run


def test_add_and_tree(run_cli) -> None:
    run_cli("add", "アプリを作る")
    run_cli("add", "バックエンド", "--parent", "1")
    run_cli("add", "move API", "--parent", "2")

    exit_code, out, _ = run_cli("tree")

    assert exit_code == 0
    assert out == "\n".join(
        [
            "[ ] #1 アプリを作る",
            "  [ ] #2 バックエンド",
            "    [ ] #3 move API",
        ]
    )


def test_add_reports_the_created_todo(run_cli) -> None:
    exit_code, out, _ = run_cli("add", "root", "--description", "詳細")

    assert exit_code == 0
    assert out == "[ ] #1 root — 詳細 parent=root position=0"


def test_list_is_empty_at_first(run_cli) -> None:
    exit_code, out, _ = run_cli("list")

    assert exit_code == 0
    assert out == "(タスクはありません)"


def test_json_output(run_cli) -> None:
    run_cli("add", "root")

    _, out, _ = run_cli("--json", "show", "1")

    assert json.loads(out) == {
        "id": 1,
        "title": "root",
        "description": "",
        "completed": False,
        "parent_id": None,
        "position": 0,
    }


def test_update_keeps_unspecified_fields(run_cli) -> None:
    run_cli("add", "root", "--description", "元の詳細")

    _, out, _ = run_cli("--json", "update", "1", "--completed")
    updated = json.loads(out)

    assert updated["title"] == "root"
    assert updated["description"] == "元の詳細"
    assert updated["completed"] is True

    _, out, _ = run_cli("--json", "update", "1", "--not-completed")
    assert json.loads(out)["completed"] is False


def test_move_changes_parent_and_position(run_cli) -> None:
    run_cli("add", "root")
    run_cli("add", "first", "--parent", "1")
    run_cli("add", "second", "--parent", "1")

    _, out, _ = run_cli("--json", "move", "3", "--parent", "1", "--position", "0")

    assert json.loads(out)["position"] == 0
    _, tree, _ = run_cli("tree")
    assert tree.splitlines()[1].strip() == "[ ] #3 second"


def test_move_without_parent_goes_to_root(run_cli) -> None:
    run_cli("add", "root")
    run_cli("add", "child", "--parent", "1")

    _, out, _ = run_cli("--json", "move", "2")

    assert json.loads(out)["parent_id"] is None


def test_delete_reports_every_removed_id(run_cli) -> None:
    run_cli("add", "root")
    run_cli("add", "child", "--parent", "1")

    exit_code, out, _ = run_cli("delete", "1")

    assert exit_code == 0
    assert out == "削除しました: #1, #2"


def test_reports_errors_on_stderr_with_a_failing_exit_code(run_cli) -> None:
    exit_code, out, err = run_cli("show", "999")

    assert exit_code == 1
    assert out == ""
    assert "Todo 999 not found" in err


def test_add_with_unknown_parent_fails(run_cli) -> None:
    exit_code, _, err = run_cli("add", "orphan", "--parent", "999")

    assert exit_code == 1
    assert "Parent todo 999 not found" in err


def test_cyclic_move_fails(run_cli) -> None:
    run_cli("add", "root")
    run_cli("add", "child", "--parent", "1")

    exit_code, _, err = run_cli("move", "1", "--parent", "2")

    assert exit_code == 1
    assert "descendant" in err
