# core と interfaces の分離

## 目的

TODO の全機能を、Web API だけでなく **MCP と CLI からも同じように**扱えるようにする。
そのために、機能そのもの（core）と、それを外へ出すアダプター（interfaces）を分けた。

## 依存の向き

```text
interfaces/webapi ─┐
interfaces/mcp    ─┼─→ core/services/TodoService ─→ core/repositories ─→ JSONL
interfaces/cli    ─┘
```

`interfaces/` は `core/` に依存し、逆向きの依存は持たない。
core は FastAPI も MCP SDK も知らないので、単体でテストできる。

## ディレクトリ

```text
web-backend/
  core/
    models/todo.py            Todo / TodoCreate / TodoUpdate / TodoMove
    repositories/
      todo_repository.py      JSONL への読み書きと正規化
    services/
      todo_service.py         TodoService — 全機能の唯一の入口
    errors.py                 TodoNotFound / ParentNotFound / CyclicMove
  interfaces/
    webapi/
      app.py                  create_app()。ルーター・MCP・静的配信を組み立てる
      todos.py                /api/todos のルーター
      mcp_info.py             /api/mcp/connection
      dependencies.py         アプリ全体で使う TodoService の保持
      error_handlers.py       core の例外 → HTTP ステータス
    mcp/
      server.py               FastMCP のツール定義
      auth.py                 API キーを検証する ASGI ミドルウェア
      config.py               キーの読み込み・生成、マウント設定
    cli/
      main.py                 argparse のコマンド群
  main.py                     app = create_app()
```

## TodoService

インターフェースが呼ぶのはこのクラスだけ。

| メソッド | 内容 |
| --- | --- |
| `list_todos()` | 深さ優先・`position` 昇順で全件 |
| `get_todo(id)` | 1 件。無ければ `TodoNotFoundError` |
| `create_todo(TodoCreate)` | 親の末尾に追加 |
| `update_todo(id, TodoUpdate)` | 本文のみ更新。親子関係は保持 |
| `move_todo(id, TodoMove)` | 親と並び順を変更。循環は拒否 |
| `delete_todo(id)` | 子孫ごと削除し、削除した id を返す |
| `render_tree()` | 字下げした木のテキスト。MCP と CLI で共用 |

リポジトリが「見つからない場合に `None`」を返すのに対し、サービスは例外を送出する。
どのインターフェースからでも失敗の扱いが同じになるようにするため。

## 例外の翻訳

core は HTTP もプロトコルも知らないので、各インターフェースが自分の表現へ翻訳する。

| core の例外 | webapi | mcp | cli |
| --- | --- | --- | --- |
| `TodoNotFoundError` | 404 `Todo not found` | `isError` のツール結果 | stderr + 終了コード 1 |
| `ParentNotFoundError` | 400 `Parent todo not found` | 同上 | 同上 |
| `CyclicMoveError` | 400 `Cannot move a todo under its own descendant` | 同上 | 同上 |

## MCP

### 載せ方

`FastMCP` を streamable HTTP で作り（`stateless_http=True`）、FastAPI へ mount する。

- サブアプリの lifespan は自動では走らないため、`create_app` の lifespan で
  `session_manager.run()` を回す。
- `app.mount("/mcp", ...)` は `/mcp/` にしか一致しないので、`/mcp` へ来た要求を
  307 で `/mcp/` へ転送する（307 はメソッドと本文を保つので POST の JSON-RPC も通る）。

### ツール

`list_todos` / `render_todo_tree` / `get_todo` / `create_todo` / `update_todo` /
`move_todo` / `delete_todo` の 7 つ。`TodoService` の全機能に対応する。

### 認証

`ApiKeyMiddleware` が `Authorization: Bearer <key>` または `X-API-Key: <key>` を
`secrets.compare_digest` で検証する。不一致は 401。

キーの決定順は `MCP_API_KEY` → キーファイル → 新規生成。
生成した場合は `data/mcp_api_key`（パーミッション 600）に保存して使い回す。

### Host の許可

MCP SDK は DNS リバインディング対策として未知の `Host` を 421 で弾く。
既定は localhost 系のみ。外部へ公開するときは `MCP_ALLOWED_HOSTS` に
カンマ区切りでホスト名を並べる。

## 接続情報の公開

`GET /api/mcp/connection` が、URL・ヘッダー名・追加コマンド・設定 JSON を返す。
UI の「MCP で連携する」パネルがこれを表示する。

**このエンドポイントは認証していない。** そのため認証キーの実体は
**ループバックからの要求にのみ**含める。それ以外には `$MCP_API_KEY` という
プレースホルダと、サーバー上のキーファイルを見るよう促す注記を返す。

`HOST=0.0.0.0` で公開する場合、Web UI 自体に認証が無い点は変わらないので、
信頼できるネットワークでのみ使うこと。

## CLI

`python -m interfaces.cli <command>`。HTTP サーバーを立てずに JSONL を直接扱う。

```sh
uv run python -m interfaces.cli tree
uv run python -m interfaces.cli add "バックエンド" --parent 1
uv run python -m interfaces.cli move 2 --parent 1 --position 0
uv run python -m interfaces.cli --json list
```

`--data-file` で対象ファイル、`--json` で機械可読な出力に切り替える。

## 機能を増やすときの手順

1. `TodoService` にメソッドを足す（必要ならリポジトリも）。
2. `interfaces/webapi/todos.py` にルートを足す。
3. `interfaces/mcp/server.py` にツールを足す。
4. `interfaces/cli/main.py` にサブコマンドを足す。

core を先に決めることで、3 つのインターフェースの振る舞いがずれない。
