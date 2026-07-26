import pytest

from core.errors import (
    CyclicMoveError,
    InvalidHierarchyError,
    ParentNotFoundError,
    TodoNotFoundError,
)
from core.models.todo import TodoCreate, TodoMove, TodoUpdate
from core.models.todo_type import TodoType
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
        TodoUpdate(
            title="バックエンド",
            description="FastAPI",
            completed=True,
            type=TodoType.EPIC,
        ),
    )

    assert service.render_tree() == "\n".join(
        [
            "[ ] #1 (product) アプリを作る",
            "  [x] #2 (epic) バックエンド — FastAPI",
            "    [ ] #3 (user_story) move API",
            "  [ ] #4 (epic) フロントエンド",
        ]
    )


def test_render_tree_when_empty(service: TodoService) -> None:
    assert service.render_tree() == "(タスクはありません)"


class TestTypeHierarchy:
    """Product > Epic > UserStory > Task > SubTask の向きだけを作れる。"""

    def test_create_allows_a_lower_type_under_a_higher_one(
        self, service: TodoService, add_todo
    ) -> None:
        product = add_todo("プロダクト", todo_type=TodoType.PRODUCT)
        epic = add_todo("エピック", parent_id=product.id, todo_type=TodoType.EPIC)

        assert epic.type is TodoType.EPIC
        assert epic.parent_id == product.id

    def test_create_allows_skipping_levels(self, service: TodoService, add_todo) -> None:
        product = add_todo("プロダクト", todo_type=TodoType.PRODUCT)

        task = add_todo("タスク", parent_id=product.id, todo_type=TodoType.TASK)

        assert task.parent_id == product.id

    def test_create_rejects_the_reverse_direction(self, service: TodoService, add_todo) -> None:
        task = add_todo("タスク", todo_type=TodoType.TASK)

        with pytest.raises(InvalidHierarchyError):
            service.create_todo(
                TodoCreate(title="エピック", parent_id=task.id, type=TodoType.EPIC)
            )

    def test_create_rejects_the_same_level(self, service: TodoService, add_todo) -> None:
        task = add_todo("タスク", todo_type=TodoType.TASK)

        with pytest.raises(InvalidHierarchyError):
            service.create_todo(TodoCreate(title="別のタスク", parent_id=task.id, type=TodoType.TASK))

    def test_any_type_can_sit_at_the_root(self, service: TodoService, add_todo) -> None:
        for todo_type in TodoType:
            assert add_todo(f"root {todo_type}", todo_type=todo_type).type is todo_type

    def test_a_bug_fits_under_any_type(self, service: TodoService, add_todo) -> None:
        product = add_todo("プロダクト", todo_type=TodoType.PRODUCT)
        subtask = add_todo("サブタスク", parent_id=product.id, todo_type=TodoType.SUBTASK)

        assert add_todo("バグ", parent_id=product.id, todo_type=TodoType.BUG).parent_id == product.id
        assert add_todo("バグ", parent_id=subtask.id, todo_type=TodoType.BUG).parent_id == subtask.id

    def test_a_bug_cannot_have_children(self, service: TodoService, add_todo) -> None:
        bug = add_todo("バグ", todo_type=TodoType.BUG)

        with pytest.raises(InvalidHierarchyError):
            service.create_todo(TodoCreate(title="子", parent_id=bug.id, type=TodoType.SUBTASK))

    def test_move_rejects_the_reverse_direction(self, service: TodoService, add_todo) -> None:
        product = add_todo("プロダクト", todo_type=TodoType.PRODUCT)
        task = add_todo("タスク", parent_id=product.id, todo_type=TodoType.TASK)
        epic = add_todo("エピック", parent_id=product.id, todo_type=TodoType.EPIC)

        with pytest.raises(InvalidHierarchyError):
            service.move_todo(epic.id, TodoMove(parent_id=task.id))

    def test_move_to_the_root_is_always_allowed(self, service: TodoService, add_todo) -> None:
        product = add_todo("プロダクト", todo_type=TodoType.PRODUCT)
        subtask = add_todo("サブタスク", parent_id=product.id, todo_type=TodoType.SUBTASK)

        assert service.move_todo(subtask.id, TodoMove()).parent_id is None

    def test_update_rejects_a_type_that_breaks_the_parent(
        self, service: TodoService, add_todo
    ) -> None:
        task = add_todo("タスク", todo_type=TodoType.TASK)
        subtask = add_todo("サブタスク", parent_id=task.id, todo_type=TodoType.SUBTASK)

        with pytest.raises(InvalidHierarchyError):
            service.update_todo(subtask.id, TodoUpdate(title="サブタスク", type=TodoType.EPIC))

    def test_update_rejects_a_type_that_breaks_a_child(
        self, service: TodoService, add_todo
    ) -> None:
        epic = add_todo("エピック", todo_type=TodoType.EPIC)
        add_todo("ユーザーストーリー", parent_id=epic.id, todo_type=TodoType.USER_STORY)

        with pytest.raises(InvalidHierarchyError):
            service.update_todo(epic.id, TodoUpdate(title="エピック", type=TodoType.TASK))

    def test_update_accepts_a_type_that_still_fits(self, service: TodoService, add_todo) -> None:
        product = add_todo("プロダクト", todo_type=TodoType.PRODUCT)
        epic = add_todo("エピック", parent_id=product.id, todo_type=TodoType.EPIC)
        add_todo("サブタスク", parent_id=epic.id, todo_type=TodoType.SUBTASK)

        updated = service.update_todo(epic.id, TodoUpdate(title="エピック", type=TodoType.TASK))

        assert updated.type is TodoType.TASK
