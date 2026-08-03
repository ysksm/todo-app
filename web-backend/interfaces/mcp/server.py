from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from core.models.todo import TodoCreate, TodoMove, TodoUpdate
from core.models.todo_status import TodoStatus
from core.models.todo_type import TodoType
from core.services.todo_service import TodoService

INSTRUCTIONS = """\
親子関係を持つ TODO を操作するサーバー。

- タスクは親を 0 個か 1 個持ち、同じ親の中では position（0 始まり）で並ぶ。
- 親を持たないタスクはルートで、複数あってよい。
- タスクには状態がある: todo / doing / done（既定は todo）。
- タスクには種類がある: product / epic / user_story / task / subtask / bug（既定は task）。
- product > epic > user_story > task > subtask は上下の決まった階層で、
  親は必ず子より上位でなければならない。階層飛ばし（product の直下に task）は許すが、
  逆向き（task の下に epic）や同じ階層どうし（task の下に task）は作れない。
- bug はこの階層の外にいる。どの種類の下にも、ルートにも置けるが、bug 自身は子を持てない。
- 上の決まりに反する create_todo / update_todo / move_todo は失敗する。
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
    def list_todos(status: TodoStatus | None = None) -> list[dict[str, Any]]:
        """全タスクを深さ優先・position 昇順で返す。status を渡すとその状態だけに絞る。"""
        return [todo.model_dump() for todo in service.list_todos(status=status)]

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
        status: TodoStatus = TodoStatus.TODO,
        parent_id: int | None = None,
        type: TodoType = TodoType.TASK,
    ) -> dict[str, Any]:
        """タスクを追加する。parent_id を渡すとその子として末尾に追加する。

        type は親より下位の種類でなければならない（bug はどこにでも置ける）。
        """
        return service.create_todo(
            TodoCreate(
                title=title,
                description=description,
                status=status,
                parent_id=parent_id,
                type=type,
            )
        ).model_dump()

    @mcp.tool()
    def update_todo(
        todo_id: int,
        title: str,
        description: str = "",
        status: TodoStatus | None = None,
        type: TodoType | None = None,
    ) -> dict[str, Any]:
        """タスクの本文・状態・種類を更新する。親子関係と並び順は変わらない。

        status を省略すると今の状態のまま。
        type を省略すると今の種類のまま。渡す場合は、いまの親・子と辻褄が合う種類に限る。
        """
        current = service.get_todo(todo_id)
        return service.update_todo(
            todo_id,
            TodoUpdate(
                title=title,
                description=description,
                status=status if status is not None else current.status,
                type=type if type is not None else current.type,
            ),
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
