from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request

from core.services.todo_service import TodoService

STATE_ATTRIBUTE = "todo_service"


def get_todo_service(request: Request) -> TodoService:
    """このリクエストを処理しているアプリの TodoService を返す。

    モジュールグローバルに持たせると、同じプロセスで複数のアプリを作ったときに
    状態が混ざるので、アプリの state に紐付ける。
    """
    return getattr(request.app.state, STATE_ATTRIBUTE)


TodoServiceDependency = Annotated[TodoService, Depends(get_todo_service)]
