from pathlib import Path

import pytest

from core.models.todo import Todo, TodoCreate, TodoMove, TodoUpdate
from core.models.todo_type import TodoType, default_child_type
from core.errors import CyclicMoveError, InvalidHierarchyError, ParentNotFoundError
from core.repositories.todo_repository import TodoRepository


def create(
    repository: TodoRepository,
    title: str,
    parent_id: int | None = None,
    todo_type: TodoType | None = None,
) -> Todo:
    """種類を省略したら親の 1 つ下の階層（ルートなら product）で作る。"""
    parent = repository.get(parent_id) if parent_id is not None else None
    return repository.create(
        TodoCreate(
            title=title,
            parent_id=parent_id,
            type=todo_type or default_child_type(parent.type if parent else None) or TodoType.TASK,
        )
    )


def titles(todos: list[Todo]) -> list[str]:
    return [todo.title for todo in todos]


def test_create_assigns_sequential_positions_per_parent(repository: TodoRepository) -> None:
    root = create(repository, "root")
    first_child = create(repository, "first", parent_id=root.id)
    second_child = create(repository, "second", parent_id=root.id)
    second_root = create(repository, "another root")

    assert (root.parent_id, root.position) == (None, 0)
    assert (first_child.parent_id, first_child.position) == (root.id, 0)
    assert (second_child.parent_id, second_child.position) == (root.id, 1)
    assert (second_root.parent_id, second_root.position) == (None, 1)


def test_create_rejects_missing_parent(repository: TodoRepository) -> None:
    with pytest.raises(ParentNotFoundError):
        create(repository, "orphan", parent_id=999)


def test_list_returns_depth_first_order(repository: TodoRepository) -> None:
    root = create(repository, "root")
    child = create(repository, "child", todo_type=TodoType.EPIC)
    repository.move(child.id, TodoMove(parent_id=root.id))
    create(repository, "grandchild", parent_id=child.id)
    create(repository, "sibling", parent_id=root.id)
    create(repository, "second root")

    assert titles(repository.list()) == [
        "root",
        "child",
        "grandchild",
        "sibling",
        "second root",
    ]


def test_update_keeps_parent_and_position(repository: TodoRepository) -> None:
    root = create(repository, "root")
    create(repository, "first", parent_id=root.id)
    second_child = create(repository, "second", parent_id=root.id)

    updated = repository.update(
        second_child.id,
        TodoUpdate(title="renamed", description="detail", completed=True, type=TodoType.EPIC),
    )

    assert updated is not None
    assert updated.title == "renamed"
    assert updated.completed is True
    assert updated.type is TodoType.EPIC
    assert updated.parent_id == root.id
    assert updated.position == 1


def test_update_returns_none_for_missing_todo(repository: TodoRepository) -> None:
    assert repository.update(999, TodoUpdate(title="x")) is None


def test_move_reorders_siblings(repository: TodoRepository) -> None:
    root = create(repository, "root")
    first = create(repository, "first", parent_id=root.id)
    create(repository, "second", parent_id=root.id)
    third = create(repository, "third", parent_id=root.id)

    moved = repository.move(third.id, TodoMove(parent_id=root.id, position=0))

    assert moved is not None
    assert moved.position == 0
    assert titles(repository.list()) == ["root", "third", "first", "second"]
    assert [todo.position for todo in repository.list()[1:]] == [0, 1, 2]

    # 元の兄弟の相対順は保たれる
    assert repository.get(first.id).position == 1


def test_move_to_root_and_back(repository: TodoRepository) -> None:
    root = create(repository, "root")
    child = create(repository, "child", parent_id=root.id)

    moved_to_root = repository.move(child.id, TodoMove(parent_id=None))
    assert moved_to_root is not None
    assert moved_to_root.parent_id is None
    assert moved_to_root.position == 1

    moved_back = repository.move(child.id, TodoMove(parent_id=root.id))
    assert moved_back is not None
    assert moved_back.parent_id == root.id
    assert moved_back.position == 0


def test_move_clamps_out_of_range_position(repository: TodoRepository) -> None:
    root = create(repository, "root")
    first = create(repository, "first", parent_id=root.id)
    create(repository, "second", parent_id=root.id)

    moved = repository.move(first.id, TodoMove(parent_id=root.id, position=99))

    assert moved is not None
    assert moved.position == 1
    assert titles(repository.list()) == ["root", "second", "first"]


def test_move_rejects_cycles(repository: TodoRepository) -> None:
    root = create(repository, "root")
    child = create(repository, "child", parent_id=root.id)
    grandchild = create(repository, "grandchild", parent_id=child.id)

    with pytest.raises(CyclicMoveError):
        repository.move(root.id, TodoMove(parent_id=grandchild.id))

    with pytest.raises(CyclicMoveError):
        repository.move(root.id, TodoMove(parent_id=root.id))


def test_create_rejects_a_type_the_parent_cannot_hold(repository: TodoRepository) -> None:
    task = create(repository, "task", todo_type=TodoType.TASK)

    with pytest.raises(InvalidHierarchyError) as error:
        create(repository, "epic", parent_id=task.id, todo_type=TodoType.EPIC)

    assert (error.value.child_type, error.value.parent_type) == (TodoType.EPIC, TodoType.TASK)
    assert titles(repository.list()) == ["task"]


def test_move_rejects_a_parent_that_is_not_higher(repository: TodoRepository) -> None:
    product = create(repository, "product")
    epic = create(repository, "epic", parent_id=product.id)
    bug = create(repository, "bug", parent_id=product.id, todo_type=TodoType.BUG)

    with pytest.raises(InvalidHierarchyError):
        repository.move(epic.id, TodoMove(parent_id=bug.id))

    assert repository.get(epic.id).parent_id == product.id


def test_move_rejects_missing_parent(repository: TodoRepository) -> None:
    todo = create(repository, "todo")

    with pytest.raises(ParentNotFoundError):
        repository.move(todo.id, TodoMove(parent_id=999))


def test_move_returns_none_for_missing_todo(repository: TodoRepository) -> None:
    assert repository.move(999, TodoMove(parent_id=None)) is None


def test_delete_cascades_to_descendants(repository: TodoRepository) -> None:
    root = create(repository, "root")
    child = create(repository, "child", parent_id=root.id)
    grandchild = create(repository, "grandchild", parent_id=child.id)
    survivor = create(repository, "survivor")

    removed_ids = repository.delete(root.id)

    assert removed_ids == sorted([root.id, child.id, grandchild.id])
    assert titles(repository.list()) == ["survivor"]
    assert repository.get(survivor.id) is not None


def test_delete_returns_empty_list_for_missing_todo(repository: TodoRepository) -> None:
    assert repository.delete(999) == []


def test_descendant_ids(repository: TodoRepository) -> None:
    root = create(repository, "root")
    child = create(repository, "child", parent_id=root.id)
    grandchild = create(repository, "grandchild", parent_id=child.id)
    create(repository, "unrelated")

    assert repository.descendant_ids(root.id) == {child.id, grandchild.id}
    assert repository.descendant_ids(grandchild.id) == set()


def test_reads_legacy_rows_without_parent_id(tmp_path: Path) -> None:
    data_file = tmp_path / "todos.jsonl"
    data_file.write_text(
        '{"id": 1, "title": "old one", "description": "", "completed": false}\n'
        '{"id": 2, "title": "old two", "description": "", "completed": true}\n',
        encoding="utf-8",
    )
    repository = TodoRepository(data_file=data_file)

    todos = repository.list()

    assert titles(todos) == ["old one", "old two"]
    assert [todo.parent_id for todo in todos] == [None, None]
    assert [todo.position for todo in todos] == [0, 1]
    # type を持たない行は task 扱い。読み込みでは種類の妥当性を問わない。
    assert [todo.type for todo in todos] == [TodoType.TASK, TodoType.TASK]


def test_reads_rows_whose_types_break_the_hierarchy(tmp_path: Path) -> None:
    """種類を入れる前に作られた入れ子は、読むだけなら壊さずそのまま返す。"""
    data_file = tmp_path / "todos.jsonl"
    data_file.write_text(
        '{"id": 1, "title": "parent", "parent_id": null, "position": 0}\n'
        '{"id": 2, "title": "child", "parent_id": 1, "position": 0}\n',
        encoding="utf-8",
    )
    repository = TodoRepository(data_file=data_file)

    todos = repository.list()

    assert titles(todos) == ["parent", "child"]
    assert todos[1].parent_id == 1


def test_normalizes_orphans_and_duplicate_positions(tmp_path: Path) -> None:
    data_file = tmp_path / "todos.jsonl"
    data_file.write_text(
        '{"id": 1, "title": "root", "parent_id": null, "position": 0}\n'
        '{"id": 2, "title": "orphan", "parent_id": 404, "position": 7}\n'
        '{"id": 3, "title": "dup a", "parent_id": 1, "position": 0}\n'
        '{"id": 4, "title": "dup b", "parent_id": 1, "position": 0}\n',
        encoding="utf-8",
    )
    repository = TodoRepository(data_file=data_file)

    todos = repository.list()
    by_title = {todo.title: todo for todo in todos}

    assert by_title["orphan"].parent_id is None
    assert by_title["orphan"].position == 1
    # 同点の position はファイル出現順で解決する
    assert by_title["dup a"].position == 0
    assert by_title["dup b"].position == 1


def test_breaks_cycles_in_stored_data(tmp_path: Path) -> None:
    data_file = tmp_path / "todos.jsonl"
    data_file.write_text(
        '{"id": 1, "title": "a", "parent_id": 2, "position": 0}\n'
        '{"id": 2, "title": "b", "parent_id": 1, "position": 0}\n',
        encoding="utf-8",
    )
    repository = TodoRepository(data_file=data_file)

    todos = repository.list()

    assert len(todos) == 2
    assert sum(1 for todo in todos if todo.parent_id is None) == 1
