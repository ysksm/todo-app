from __future__ import annotations

import asyncio
import threading
from dataclasses import dataclass


@dataclass(frozen=True)
class TodoEvent:
    """TODO が変わったことを表すイベント。

    クライアントはこれを合図に一覧を取り直すだけなので、
    ペイロードは種別と対象 id だけの軽いものに留める。
    """

    action: str  # "created" | "updated" | "moved" | "deleted"
    ids: tuple[int, ...]


class TodoEventBroker:
    """TODO の変更をプロセス内で配る pub/sub。

    FastAPI の sync ルートはワーカースレッドで動くため、publish は
    どのスレッドから呼ばれてもよい。購読者は自分のイベントループ上の
    asyncio.Queue で受け取る（SSE エンドポイントが使う）。
    購読者がいなければ publish は何もしないので、CLI から使っても害はない。
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subscribers: dict[
            int, tuple[asyncio.Queue[TodoEvent], asyncio.AbstractEventLoop]
        ] = {}
        self._next_token = 0

    def subscribe(self) -> tuple[int, asyncio.Queue[TodoEvent]]:
        """実行中のイベントループに紐付くキューを登録する。

        戻り値の token を unsubscribe に渡して購読を解除する。
        """
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[TodoEvent] = asyncio.Queue()
        with self._lock:
            token = self._next_token
            self._next_token += 1
            self._subscribers[token] = (queue, loop)
        return token, queue

    def unsubscribe(self, token: int) -> None:
        with self._lock:
            self._subscribers.pop(token, None)

    def publish(self, event: TodoEvent) -> None:
        with self._lock:
            subscribers = list(self._subscribers.values())
        for queue, loop in subscribers:
            try:
                loop.call_soon_threadsafe(queue.put_nowait, event)
            except RuntimeError:
                # 購読者側のループが既に閉じている。次の publish までには
                # unsubscribe されるはずなので、ここでは黙って飛ばす。
                continue
