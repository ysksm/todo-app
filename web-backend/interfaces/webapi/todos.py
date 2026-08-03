from fastapi import APIRouter, Response
from fastapi import status as http_status

from core.models.todo import Todo, TodoCreate, TodoMove, TodoUpdate
from core.models.todo_status import TodoStatus
from interfaces.webapi.dependencies import TodoServiceDependency

router = APIRouter(prefix="/api/todos", tags=["todos"])


@router.get("", response_model=list[Todo])
def get_todos(service: TodoServiceDependency, status: TodoStatus | None = None) -> list[Todo]:
    """全件返す。?status=todo|doing|done でその状態だけに絞れる。"""
    return service.list_todos(status=status)


@router.get("/{todo_id}", response_model=Todo)
def get_todo(todo_id: int, service: TodoServiceDependency) -> Todo:
    return service.get_todo(todo_id)


@router.post("", response_model=Todo)
def create_todo(todo_create: TodoCreate, service: TodoServiceDependency) -> Todo:
    return service.create_todo(todo_create)


@router.put("/{todo_id}", response_model=Todo)
def update_todo(todo_id: int, todo_update: TodoUpdate, service: TodoServiceDependency) -> Todo:
    return service.update_todo(todo_id, todo_update)


@router.patch("/{todo_id}/move", response_model=Todo)
def move_todo(todo_id: int, todo_move: TodoMove, service: TodoServiceDependency) -> Todo:
    return service.move_todo(todo_id, todo_move)


@router.delete("/{todo_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def delete_todo(todo_id: int, service: TodoServiceDependency) -> Response:
    """対象とその子孫をまとめて削除する。"""
    service.delete_todo(todo_id)
    return Response(status_code=http_status.HTTP_204_NO_CONTENT)
