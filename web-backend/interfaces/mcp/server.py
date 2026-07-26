from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from core.models.todo import TodoCreate, TodoMove, TodoUpdate
from core.services.todo_service import TodoService

INSTRUCTIONS = """\
親子関係を持つ TODO を操作するサーバー。

- タスクは親を 0 個か 1 個持ち、同じ親の中では position（0 始まり）で並ぶ。
- 親を持たないタスクはルートで、複数あってよい。
- 全体像をつかむときは render_todo_tree を使うと階層が見やすい。
- delete_todo は子孫もまとめて消すので、実行前に影響範囲を確認すること。
"""


def create_mcp_server(
    service: TodoService,
    name: str = "todo-app",
    allowed_hosts: Sequence[str] = (),
) -> FastMCP:
    """core の全機能を MCP ツールとして公開する。

    HTTP へ載せる前提なので stateless_http=True にし、パスは mount 側で決める。
    allowed_hosts を渡すと DNS リバインディング対策の許可ホストを差し替える
    （既定では SDK が localhost 系だけを許可する）。
    """
    mcp = FastMCP(
        name,
        instructions=INSTRUCTIONS,
        stateless_http=True,
        streamable_http_path="/",
        transport_security=(
            TransportSecuritySettings(
                allowed_hosts=list(allowed_hosts),
                allowed_origins=list(allowed_hosts),
            )
            if allowed_hosts
            else None
        ),
    )

    @mcp.tool()
    def list_todos() -> list[dict[str, Any]]:
        """全タスクを深さ優先・position 昇順で返す。"""
        return [todo.model_dump() for todo in service.list_todos()]

    @mcp.tool()
    def render_todo_tree() -> str:
        """全タスクを字下げした木のテキストとして返す。"""
        return service.render_tree()

    @mcp.tool()
    def get_todo(todo_id: int) -> dict[str, Any]:
        """id を指定して 1 件取得する。"""
        return service.get_todo(todo_id).model_dump()

    @mcp.tool()
    def create_todo(
        title: str,
        description: str = "",
        completed: bool = False,
        parent_id: int | None = None,
    ) -> dict[str, Any]:
        """タスクを追加する。parent_id を渡すとその子として末尾に追加する。"""
        return service.create_todo(
            TodoCreate(
                title=title,
                description=description,
                completed=completed,
                parent_id=parent_id,
            )
        ).model_dump()

    @mcp.tool()
    def update_todo(
        todo_id: int,
        title: str,
        description: str = "",
        completed: bool = False,
    ) -> dict[str, Any]:
        """タスクの本文を更新する。親子関係と並び順は変わらない。"""
        return service.update_todo(
            todo_id,
            TodoUpdate(title=title, description=description, completed=completed),
        ).model_dump()

    @mcp.tool()
    def move_todo(
        todo_id: int,
        parent_id: int | None = None,
        position: int | None = None,
    ) -> dict[str, Any]:
        """タスクの親と並び順を変える。parent_id=None ならルートへ、position=None なら末尾へ。"""
        return service.move_todo(
            todo_id,
            TodoMove(parent_id=parent_id, position=position),
        ).model_dump()

    @mcp.tool()
    def delete_todo(todo_id: int) -> dict[str, Any]:
        """タスクを削除する。子孫もまとめて削除され、削除した id を返す。"""
        return {"deleted_ids": service.delete_todo(todo_id)}

    return mcp
