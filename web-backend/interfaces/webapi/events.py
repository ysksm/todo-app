from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter
from starlette.responses import StreamingResponse

from core.events import TodoEventBroker
from interfaces.webapi.dependencies import TodoServiceDependency

router = APIRouter(prefix="/api/todos", tags=["todos"])

# プロキシに接続を切られないよう、イベントが無くても定期的にコメント行を流す。
KEEP_ALIVE_SECONDS = 15.0


@router.get("/events", include_in_schema=True)
async def stream_todo_events(service: TodoServiceDependency) -> StreamingResponse:
    """TODO の変更を SSE で配る。

    イベントは「変わった」という合図だけなので、クライアントは受信したら
    GET /api/todos で一覧を取り直す。
    """
    return StreamingResponse(
        _event_stream(service.events),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # nginx 等のバッファリングで届かなくなるのを防ぐ。
            "X-Accel-Buffering": "no",
        },
    )


async def _event_stream(broker: TodoEventBroker) -> AsyncIterator[str]:
    token, queue = broker.subscribe()
    try:
        # 接続直後に 1 行返して、クライアント側で open を確定させる。
        yield ": connected\n\n"
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=KEEP_ALIVE_SECONDS)
            except TimeoutError:
                yield ": keep-alive\n\n"
                continue
            data = json.dumps({"action": event.action, "ids": list(event.ids)})
            yield f"event: todos_changed\ndata: {data}\n\n"
    finally:
        # クライアント切断で generator がキャンセルされたときもここを通る。
        broker.unsubscribe(token)
