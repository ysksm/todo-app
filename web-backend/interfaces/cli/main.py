"""TODO を端末から操作する CLI。

webapi / mcp と同じ TodoService を呼ぶので、どこから触っても同じデータになる。

    uv run python -m interfaces.cli tree
    uv run python -m interfaces.cli add "アプリを作る" --type product
    uv run python -m interfaces.cli add "バックエンド" --parent 1 --type epic
    uv run python -m interfaces.cli move 2 --parent 1 --position 0
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path

from core.errors import TodoError
from core.models.todo import Todo, TodoCreate, TodoMove, TodoUpdate
from core.models.todo_type import TodoType
from core.repositories.todo_repository import TodoRepository
from core.services.todo_service import TodoService

TYPE_CHOICES = [todo_type.value for todo_type in TodoType]
TYPE_HELP = f"タスクの種類（{' / '.join(TYPE_CHOICES)}）"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="todo", description="親子関係を持つ TODO を操作する")
    parser.add_argument("--data-file", type=Path, help="JSONL の保存先を明示する")
    parser.add_argument("--json", action="store_true", help="結果を JSON で出力する")

    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("list", help="全タスクを 1 行ずつ表示する")
    subparsers.add_parser("tree", help="全タスクを木として表示する")

    show = subparsers.add_parser("show", help="1 件表示する")
    show.add_argument("todo_id", type=int)

    add = subparsers.add_parser("add", help="タスクを追加する")
    add.add_argument("title")
    add.add_argument("--description", default="")
    add.add_argument("--parent", type=int, default=None, help="親タスクの id")
    add.add_argument("--completed", action="store_true")
    add.add_argument(
        "--type",
        choices=TYPE_CHOICES,
        default=TodoType.TASK.value,
        help=TYPE_HELP,
    )

    update = subparsers.add_parser("update", help="タスクの本文と種類を更新する")
    update.add_argument("todo_id", type=int)
    update.add_argument("--title", help="省略すると現在のタイトルを使う")
    update.add_argument("--description")
    update.add_argument(
        "--type",
        choices=TYPE_CHOICES,
        default=None,
        help=f"{TYPE_HELP}。省略すると今の種類のまま",
    )
    completion = update.add_mutually_exclusive_group()
    completion.add_argument("--completed", dest="completed", action="store_true", default=None)
    completion.add_argument("--not-completed", dest="completed", action="store_false")

    move = subparsers.add_parser("move", help="親と並び順を変える")
    move.add_argument("todo_id", type=int)
    move.add_argument("--parent", type=int, default=None, help="省略するとルートへ移動する")
    move.add_argument("--position", type=int, default=None, help="省略すると末尾へ移動する")

    delete = subparsers.add_parser("delete", help="タスクを削除する（子孫も削除される）")
    delete.add_argument("todo_id", type=int)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    service = TodoService(TodoRepository(data_file=args.data_file))

    try:
        output = run_command(service, args)
    except TodoError as error:
        print(f"エラー: {error}", file=sys.stderr)
        return 1

    if output:
        print(output)
    return 0


def run_command(service: TodoService, args: argparse.Namespace) -> str:
    as_json = args.json

    match args.command:
        case "list":
            todos = service.list_todos()
            return (
                dump_json([todo.model_dump() for todo in todos])
                if as_json
                else "\n".join(format_todo(todo) for todo in todos) or "(タスクはありません)"
            )
        case "tree":
            if as_json:
                return dump_json([todo.model_dump() for todo in service.list_todos()])
            return service.render_tree()
        case "show":
            return render_todo(service.get_todo(args.todo_id), as_json)
        case "add":
            created = service.create_todo(
                TodoCreate(
                    title=args.title,
                    description=args.description,
                    completed=args.completed,
                    parent_id=args.parent,
                    type=TodoType(args.type),
                )
            )
            return render_todo(created, as_json)
        case "update":
            current = service.get_todo(args.todo_id)
            updated = service.update_todo(
                args.todo_id,
                TodoUpdate(
                    title=args.title if args.title is not None else current.title,
                    description=(
                        args.description if args.description is not None else current.description
                    ),
                    completed=args.completed if args.completed is not None else current.completed,
                    type=TodoType(args.type) if args.type is not None else current.type,
                ),
            )
            return render_todo(updated, as_json)
        case "move":
            moved = service.move_todo(
                args.todo_id,
                TodoMove(parent_id=args.parent, position=args.position),
            )
            return render_todo(moved, as_json)
        case "delete":
            removed_ids = service.delete_todo(args.todo_id)
            if as_json:
                return dump_json({"deleted_ids": removed_ids})
            return f"削除しました: {', '.join(f'#{todo_id}' for todo_id in removed_ids)}"

    raise AssertionError(f"未対応のコマンド: {args.command}")


def render_todo(todo: Todo, as_json: bool) -> str:
    return dump_json(todo.model_dump()) if as_json else format_todo(todo)


def format_todo(todo: Todo) -> str:
    checkbox = "[x]" if todo.completed else "[ ]"
    parent = f" parent=#{todo.parent_id}" if todo.parent_id is not None else " parent=root"
    description = f" — {todo.description}" if todo.description else ""
    return (
        f"{checkbox} #{todo.id} ({todo.type}) {todo.title}{description}"
        f"{parent} position={todo.position}"
    )


def dump_json(payload: object) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    raise SystemExit(main())
