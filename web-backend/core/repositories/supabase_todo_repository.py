from __future__ import annotations

import os
import threading
from collections.abc import Iterator
from contextlib import contextmanager

import httpx

from core.models.todo import Todo
from core.repositories.todo_repository import TodoRepository

DEFAULT_TABLE = "todos"
COLUMNS = "id,title,description,status,type,parent_id,position"
REQUEST_TIMEOUT_SECONDS = 10.0


class SupabaseConfigError(RuntimeError):
    """SUPABASE_URL / SUPABASE_KEY が無いなど、接続設定の不備。"""


class SupabaseRequestError(RuntimeError):
    """Supabase への読み書きが失敗した。"""


class SupabaseTodoRepository(TodoRepository):
    """Supabase（PostgREST）の todos テーブルへ保存するリポジトリ。

    階層の検証や正規化は TodoRepository のロジックをそのまま使い、
    永続化（_read_todos / _write_todos）と排他（_locked）だけを差し替える。

    JSONL 版の flock と違い、排他はプロセス内の threading.Lock のみ。
    複数プロセスから同時に書くと後勝ちになるので、Supabase を使うときは
    バックエンドを 1 プロセスで動かす想定（webapi / mcp は同一プロセス）。
    """

    def __init__(
        self,
        url: str | None = None,
        key: str | None = None,
        table: str | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        resolved_url = (url or os.environ.get("SUPABASE_URL", "")).strip().rstrip("/")
        resolved_key = (key or os.environ.get("SUPABASE_KEY", "")).strip()
        if not resolved_url or not resolved_key:
            raise SupabaseConfigError(
                "Supabase を使うには SUPABASE_URL と SUPABASE_KEY を設定してください"
            )

        self.url = resolved_url
        self.table = table or os.environ.get("SUPABASE_TODOS_TABLE", DEFAULT_TABLE)
        self._lock = threading.Lock()
        self._client = httpx.Client(
            base_url=f"{resolved_url}/rest/v1",
            headers={
                "apikey": resolved_key,
                "Authorization": f"Bearer {resolved_key}",
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
            transport=transport,
        )

    @contextmanager
    def _locked(self) -> Iterator[None]:
        with self._lock:
            yield

    def _read_todos(self) -> list[Todo]:
        # id 昇順で読むことで、position が同点のときの並びを毎回同じにする
        # （JSONL 版のファイル内順序に相当）。
        response = self._request(
            "GET",
            f"/{self.table}",
            params={"select": COLUMNS, "order": "id.asc"},
        )
        try:
            rows = response.json()
            todos = [Todo.model_validate(row) for row in rows]
        except ValueError as error:
            raise SupabaseRequestError(
                f"Supabase の応答を TODO として読めませんでした: {error}"
            ) from error
        return self._normalize(todos)

    def _write_todos(self, todos: list[Todo]) -> None:
        normalized_todos = self._normalize(todos)
        if not normalized_todos:
            self._request("DELETE", f"/{self.table}", params={"id": "not.is.null"})
            return

        self._request(
            "POST",
            f"/{self.table}",
            params={"on_conflict": "id"},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            json=[todo.model_dump(mode="json") for todo in normalized_todos],
        )
        kept_ids = ",".join(str(todo.id) for todo in normalized_todos)
        self._request("DELETE", f"/{self.table}", params={"id": f"not.in.({kept_ids})"})

    def _request(
        self,
        method: str,
        path: str,
        params: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        json: object | None = None,
    ) -> httpx.Response:
        try:
            response = self._client.request(
                method, path, params=params, headers=headers, json=json
            )
        except httpx.HTTPError as error:
            raise SupabaseRequestError(f"Supabase へ接続できませんでした: {error}") from error

        if response.is_error:
            raise SupabaseRequestError(
                f"Supabase が {method} {path} を {response.status_code} で拒否しました: "
                f"{response.text}"
            )
        return response
