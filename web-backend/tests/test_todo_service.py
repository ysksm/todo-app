import pytest

from core.errors import CyclicMoveError, ParentNotFoundError, TodoNotFoundError
from core.models.todo import TodoCreate, TodoMove, TodoUpdate
from core.services.todo_service import TodoService


def test_get_todo_raises_when_missing(service: TodoService) -> None:
    with pytest.raises(TodoNotFoundError) as error:
        service.get_todo(999)

    assert error.value.todo_id == 999


def test_update_raises_when_missing(service: TodoService) -> None:
    with pytest.raises(TodoNotFoundError):
        service.update_todo(999, TodoUpdate(title="nope"))


def test_move_raises_when_missing(service: TodoService) -> None:
    with pytest.raises(TodoNotFoundError):
        service.move_todo(999, TodoMove())


def test_delete_raises_when_missing(service: TodoService) -> None:
    with pytest.raises(TodoNotFoundError):
        service.delete_todo(999)


def test_create_raises_for_unknown_parent(service: TodoService) -> None:
    with pytest.raises(ParentNotFoundError):
        service.create_todo(TodoCreate(title="orphan", parent_id=999))


def test_move_raises_for_cycle(service: TodoService, add_todo) -> None:
    root = add_todo("root")
    child = add_todo("child", parent_id=root.id)

    with pytest.raises(CyclicMoveError):
        service.move_todo(root.id, TodoMove(parent_id=child.id))


def test_delete_returns_every_removed_id(service: TodoService, add_todo) -> None:
    root = add_todo("root")
    child = add_todo("child", parent_id=root.id)
    grandchild = add_todo("grandchild", parent_id=child.id)

    assert service.delete_todo(root.id) == sorted([root.id, child.id, grandchild.id])
    assert service.list_todos() == []


def test_render_tree_indents_by_depth(service: TodoService, add_todo) -> None:
    root = add_todo("アプリを作る")
    backend = add_todo("バックエンド", parent_id=root.id)
    add_todo("move API", parent_id=backend.id)
    add_todo("フロントエンド", parent_id=root.id)
    service.update_todo(
        backend.id,
        TodoUpdate(title="バックエンド", description="FastAPI", completed=True),
    )

    assert service.render_tree() == "\n".join(
        [
            "[ ] #1 アプリを作る",
            "  [x] #2 バックエンド — FastAPI",
            "    [ ] #3 move API",
            "  [ ] #4 フロントエンド",
        ]
    )


def test_render_tree_when_empty(service: TodoService) -> None:
    assert service.render_tree() == "(タスクはありません)"
