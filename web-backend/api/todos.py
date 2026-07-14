from typing import NoReturn

from fastapi import APIRouter, HTTPException, status

from models.todo import Todo, TodoCreate
from repositories.todo_repository import TodoRepository

router = APIRouter(prefix="/api/todos", tags=["todos"])

repository = TodoRepository()


@router.get("", response_model=list[Todo])
def get_todos() -> list[Todo]:
    return repository.list()


@router.get("/{todo_id}", response_model=Todo)
def get_todo(todo_id: int) -> Todo:
    todo = repository.get(todo_id)
    if todo is None:
        raise_todo_not_found()
    return todo


@router.post("", response_model=Todo)
def create_todo(todo_create: TodoCreate) -> Todo:
    return repository.create(todo_create)


@router.put("/{todo_id}", response_model=Todo)
def update_todo(todo_id: int, todo_update: TodoCreate) -> Todo:
    todo = repository.update(todo_id, todo_update)
    if todo is None:
        raise_todo_not_found()
    return todo


@router.delete("/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_todo(todo_id: int) -> None:
    if not repository.delete(todo_id):
        raise_todo_not_found()


def raise_todo_not_found() -> NoReturn:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
