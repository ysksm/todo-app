from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from core.errors import CyclicMoveError, ParentNotFoundError, TodoNotFoundError

# core の例外を HTTP の応答へ翻訳する。ルーターは変換を意識しない。
ERROR_RESPONSES: dict[type[Exception], tuple[int, str]] = {
    TodoNotFoundError: (status.HTTP_404_NOT_FOUND, "Todo not found"),
    ParentNotFoundError: (status.HTTP_400_BAD_REQUEST, "Parent todo not found"),
    CyclicMoveError: (
        status.HTTP_400_BAD_REQUEST,
        "Cannot move a todo under its own descendant",
    ),
}


def register_error_handlers(app: FastAPI) -> None:
    for error_type, (status_code, detail) in ERROR_RESPONSES.items():
        app.add_exception_handler(error_type, _make_handler(status_code, detail))


def _make_handler(status_code: int, detail: str):
    async def handle(_request: Request, _exception: Exception) -> JSONResponse:
        return JSONResponse(status_code=status_code, content={"detail": detail})

    return handle
