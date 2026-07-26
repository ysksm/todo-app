class TodoError(Exception):
    """要求を満たせなかったことを表す core 共通の基底例外。

    インターフェース層（webapi / mcp / cli）が、この型を自分の表現へ翻訳する。
    """


class TodoNotFoundError(TodoError):
    def __init__(self, todo_id: int) -> None:
        super().__init__(f"Todo {todo_id} not found")
        self.todo_id = todo_id


class ParentNotFoundError(TodoError):
    def __init__(self, parent_id: int) -> None:
        super().__init__(f"Parent todo {parent_id} not found")
        self.parent_id = parent_id


class CyclicMoveError(TodoError):
    def __init__(self, todo_id: int, parent_id: int) -> None:
        super().__init__(f"Cannot move todo {todo_id} under its own descendant {parent_id}")
        self.todo_id = todo_id
        self.parent_id = parent_id


class InvalidHierarchyError(TodoError):
    """種類の上下関係に反する親子を作ろうとした。

    親の種類・子の種類は core.models.todo_type の階層で判定する。
    """

    def __init__(self, child_type: str, parent_type: str) -> None:
        super().__init__(f"Cannot place a {child_type} under a {parent_type}")
        self.child_type = child_type
        self.parent_type = parent_type
