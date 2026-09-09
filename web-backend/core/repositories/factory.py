from __future__ import annotations

import os
from pathlib import Path

from core.repositories.todo_repository import TodoRepository

#: TODO_STORAGE が取れる値。
STORAGE_JSONL = "jsonl"
STORAGE_SUPABASE = "supabase"


def create_todo_repository(data_file: Path | None = None) -> TodoRepository:
    """環境変数 TODO_STORAGE に応じたリポジトリを組み立てる。

    - 未設定 / "jsonl" — JSONL ファイル（従来どおり。TODO_DATA_FILE も効く）
    - "supabase" — Supabase の todos テーブル（SUPABASE_URL / SUPABASE_KEY が必要）

    data_file を明示された場合（CLI の --data-file）は常に JSONL を使う。
    """
    if data_file is not None:
        return TodoRepository(data_file=data_file)

    storage = os.environ.get("TODO_STORAGE", STORAGE_JSONL).strip().lower()
    if storage in ("", STORAGE_JSONL):
        return TodoRepository()
    if storage == STORAGE_SUPABASE:
        # httpx への依存を JSONL だけの利用者に強いないよう、ここで読み込む。
        from core.repositories.supabase_todo_repository import SupabaseTodoRepository

        return SupabaseTodoRepository()
    raise ValueError(
        f"未対応の TODO_STORAGE です: {storage!r}"
        f"（{STORAGE_JSONL} か {STORAGE_SUPABASE} を指定してください）"
    )
