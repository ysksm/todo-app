import asyncio
import threading

from core.events import TodoEvent, TodoEventBroker
from core.models.todo import TodoCreate, TodoMove, TodoUpdate
from core.models.todo_type import TodoType
from core.repositories.todo_repository import TodoRepository
from core.services.todo_service import TodoService
from interfaces.webapi.events import _event_stream


class RecordingBroker(TodoEventBroker):
    def __init__(self) -> None:
        super().__init__()
        self.published: list[TodoEvent] = []

    def publish(self, event: TodoEvent) -> None:
        self.published.append(event)
        super().publish(event)


def make_service(tmp_path) -> tuple[TodoService, RecordingBroker]:
    broker = RecordingBroker()
    service = TodoService(TodoRepository(data_file=tmp_path / "todos.jsonl"), events=broker)
    return service, broker


def test_broker_delivers_from_another_thread() -> None:
    """FastAPI の sync ルート（ワーカースレッド）からの publish を模す。"""

    async def scenario() -> TodoEvent:
        broker = TodoEventBroker()
        token, queue = broker.subscribe()
        try:
            thread = threading.Thread(
                target=broker.publish, args=(TodoEvent(action="created", ids=(1,)),)
            )
            thread.start()
            thread.join()
            return await asyncio.wait_for(queue.get(), timeout=2.0)
        finally:
            broker.unsubscribe(token)

    event = asyncio.run(scenario())
    assert event == TodoEvent(action="created", ids=(1,))


def test_unsubscribed_queue_stops_receiving() -> None:
    async def scenario() -> bool:
        broker = TodoEventBroker()
        token, queue = broker.subscribe()
        broker.unsubscribe(token)
        broker.publish(TodoEvent(action="created", ids=(1,)))
        # call_soon_threadsafe 分を消化してから確かめる。
        await asyncio.sleep(0)
        return queue.empty()

    assert asyncio.run(scenario())


def test_publish_without_subscribers_is_a_noop() -> None:
    # CLI など、イベントループが無い文脈でも壊れないこと。
    TodoEventBroker().publish(TodoEvent(action="created", ids=(1,)))


def test_event_stream_yields_sse_frames() -> None:
    """SSE ジェネレータが接続確認・イベント・購読解除を正しく行うこと。"""

    async def scenario() -> None:
        broker = TodoEventBroker()
        stream = _event_stream(broker)

        assert (await asyncio.wait_for(anext(stream), timeout=2.0)) == ": connected\n\n"

        # 購読が効いてから publish する（最初の yield の時点で subscribe 済み）。
        broker.publish(TodoEvent(action="created", ids=(5,)))
        frame = await asyncio.wait_for(anext(stream), timeout=2.0)
        assert frame == 'event: todos_changed\ndata: {"action": "created", "ids": [5]}\n\n'

        # クライアント切断相当。ここで購読が解除されること。
        await stream.aclose()
        assert not broker._subscribers

    asyncio.run(scenario())


def test_service_publishes_on_each_mutation(tmp_path) -> None:
    service, broker = make_service(tmp_path)

    root = service.create_todo(TodoCreate(title="root", type=TodoType.PRODUCT))
    child = service.create_todo(
        TodoCreate(title="child", parent_id=root.id, type=TodoType.EPIC)
    )
    service.update_todo(root.id, TodoUpdate(title="renamed", type=TodoType.PRODUCT))
    service.move_todo(child.id, TodoMove(parent_id=None, position=0))
    service.delete_todo(root.id)

    assert [(event.action, event.ids) for event in broker.published] == [
        ("created", (root.id,)),
        ("created", (child.id,)),
        ("updated", (root.id,)),
        ("moved", (child.id,)),
        ("deleted", (root.id,)),
    ]


def test_service_does_not_publish_on_failure(tmp_path) -> None:
    service, broker = make_service(tmp_path)

    try:
        service.delete_todo(999)
    except Exception:
        pass

    assert broker.published == []
