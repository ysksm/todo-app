# TODO API

## Requirements

- [uv](https://docs.astral.sh/uv/)
- Python 3.13 (managed by `uv` through `.python-version`)

## Setup and run

From the repository root, synchronize dependencies and start the development server:

```sh
cd web-backend
uv sync
./start.sh
```

The API is available at `http://127.0.0.1:8000`, and Swagger UI is available at
`http://127.0.0.1:8000/docs`.

`start.sh` can also be run from the repository root:

```sh
sh ./web-backend/start.sh
```

Todo data is persisted to `data/todos.jsonl`. Set `TODO_DATA_FILE` to use a
different JSONL file.

## Changing the listen host and port

`start.sh` listens on `127.0.0.1:8000` by default. To change this, copy
`.env.example` to `.env` and edit `HOST` / `PORT`:

```sh
cd web-backend
cp .env.example .env
# edit .env, e.g. PORT=3000
```

Environment variables also work without a `.env` file:

```sh
PORT=3000 ./start.sh
```

## API

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `GET` | `/api/todos` | — | `Todo[]`, depth first and ordered by `position` |
| `GET` | `/api/todos/{id}` | — | `Todo` |
| `POST` | `/api/todos` | `TodoCreate` | `Todo` |
| `PUT` | `/api/todos/{id}` | `TodoUpdate` | `Todo` |
| `PATCH` | `/api/todos/{id}/move` | `TodoMove` | `Todo` |
| `DELETE` | `/api/todos/{id}` | — | `204` |
| `GET` | `/api/todos/events` | — | SSE (`text/event-stream`) |

### Change notifications (SSE)

`GET /api/todos/events` streams a `todos_changed` event whenever a todo is
created, updated, moved, or deleted — through the Web API or MCP alike:

```
event: todos_changed
data: {"action": "created", "ids": [5]}
```

The payload is only a hint; clients are expected to refetch `GET /api/todos`
when an event arrives. A `: keep-alive` comment is sent every 15 seconds while
idle.

A todo has at most one parent (`parent_id`) and keeps a `position` among its
siblings. Todos without a parent are roots, and there can be more than one.

Each todo has a `status` of `todo`, `doing`, or `done` (default `todo`).
`GET /api/todos?status=doing` returns only todos in that status. Rows or
requests that still carry the legacy `completed` boolean are accepted:
`true` maps to `done`, `false` to `todo`.

- `POST` takes `parent_id` to add the todo under an existing todo. `null` adds a root.
- `PUT` only replaces `title` / `description` / `status` / `type`. It never changes
  `parent_id` or `position`.
- `PATCH .../move` changes `parent_id` and `position`. A `position` of `null`
  appends to the end; out-of-range values are clamped.
- **`DELETE` cascades**: the todo and all of its descendants are removed.

Errors:

| Situation | Status | `detail` |
| --- | --- | --- |
| The todo does not exist | 404 | `Todo not found` |
| The given parent does not exist | 400 | `Parent todo not found` |
| The new parent is the todo itself or one of its descendants | 400 | `Cannot move a todo under its own descendant` |

## Tests

```sh
uv run pytest
```

## MCP

The same functionality is exposed over MCP (streamable HTTP) at `/mcp`, protected by a
shared API key. One `TodoService` instance backs the Web API and MCP, so changes made
from either side are immediately visible in the other.

Tools: `list_todos`, `render_todo_tree`, `get_todo`, `create_todo`, `update_todo`,
`move_todo`, `delete_todo`.

### The API key

The key comes from `MCP_API_KEY`. If that is not set, a key is generated on first start
and stored in `data/mcp_api_key` (mode `600`, git-ignored) so it survives restarts.

Send it as `Authorization: Bearer <key>` or `X-API-Key: <key>`. Clients that cannot set
headers (the Claude app's custom connectors) can put the key in the URL instead:
`/mcp?key=<key>`. Requests without a valid key get `401`.

Note that a query-string key can end up in access logs and browser history — prefer the
header when the client supports it, and regenerate the key (delete `data/mcp_api_key`)
if a URL leaks.

### Registering a client

Open 設定 (the ⚙ button in the web UI header) to copy ready-made commands for each
client, or build them by hand:

```sh
# Claude Code
claude mcp add --transport http todo-app http://127.0.0.1:8000/mcp \
  --header "Authorization: Bearer $(cat data/mcp_api_key)"
```

```toml
# Codex CLI — append to ~/.codex/config.toml (recent versions support HTTP servers)
[mcp_servers.todo-app]
url = "http://127.0.0.1:8000/mcp?key=<the API key>"
```

ChatGPT: 設定 → コネクタ → 詳細設定で開発者モードを有効にし、「コネクタを作成」に
`https://<public-host>/mcp?key=<the API key>` を登録する（認証は「なし」を選ぶ。
Claude アプリと同じく公開 HTTPS が必要 — see "Connecting from the Claude app" below）。

`GET /api/mcp/connection` returns the same information as JSON. **That endpoint is not
authenticated**, so it only includes the actual key when the request comes from a
loopback address. Remote callers get a `$MCP_API_KEY` placeholder instead.

### Serving MCP beyond localhost

The MCP SDK rejects unknown `Host` headers with `421` to prevent DNS rebinding. When
running with `HOST=0.0.0.0`, list the hostnames clients will use:

```sh
MCP_ALLOWED_HOSTS=todo.example.com,192.168.1.10:8000 ./start.sh
```

### HTTPS

`start.sh` terminates TLS itself when both `SSL_CERTFILE` and `SSL_KEYFILE` are set.
For local certificates, [mkcert](https://github.com/FiloSottile/mkcert) is the easiest:

```sh
mkcert -install
mkcert localhost 127.0.0.1
SSL_CERTFILE=./localhost+1.pem SSL_KEYFILE=./localhost+1-key.pem ./start.sh
# → https://127.0.0.1:8000
```

Behind a tunnel or reverse proxy, leave TLS to the proxy. `start.sh` passes
`--proxy-headers`, so `X-Forwarded-Proto` / `Host` from the proxy are used to build the
URLs shown by `GET /api/mcp/connection`. If those headers are not forwarded correctly,
set `MCP_PUBLIC_URL=https://your-host` to override the displayed base URL.

### Connecting from the Claude app (custom connector)

The Claude app (claude.ai / desktop) connects to remote MCP servers from Anthropic's
infrastructure, so it needs a **publicly reachable HTTPS URL** with a valid certificate —
a self-signed localhost cert is not enough. The quickest way is a tunnel:

```sh
# terminal 1: the backend
./start.sh

# terminal 2: a tunnel (no account needed for a quick try)
cloudflared tunnel --url http://127.0.0.1:8000
# → prints https://<random>.trycloudflare.com
```

Then:

1. Restart the backend with the tunnel host allowed and (optionally) shown in the UI:

   ```sh
   MCP_ALLOWED_HOSTS=<random>.trycloudflare.com \
   MCP_PUBLIC_URL=https://<random>.trycloudflare.com ./start.sh
   ```

2. In the Claude app: 設定 → コネクタ → 「カスタムコネクタを追加」 and paste

   ```
   https://<random>.trycloudflare.com/mcp?key=<the API key>
   ```

   Custom connectors cannot send custom headers, which is why the key rides in the URL
   (`?key=`). The web UI's "MCP で連携する" panel shows this URL ready to copy.

Anyone with that URL can operate the server, so treat it like a password: stop the
tunnel when you are done, and delete `data/mcp_api_key` to rotate the key if needed.

## CLI

The CLI talks to `TodoService` directly — no HTTP server needed.

```sh
uv run python -m interfaces.cli tree
uv run python -m interfaces.cli add "アプリを作る"
uv run python -m interfaces.cli add "バックエンド" --parent 1
uv run python -m interfaces.cli move 2 --parent 1 --position 0
uv run python -m interfaces.cli --json list
uv run python -m interfaces.cli delete 1
```

`--data-file` points at a different JSONL file, and `--json` switches the output format.
Errors go to stderr with exit code 1.

## Tests

```sh
uv run pytest
```

## Project structure

```text
core/          全機能。インターフェースからは独立している
  models/        Pydantic のモデル
  repositories/  JSONL への永続化
  services/      TodoService — 唯一の入口
  errors.py      インターフェースが翻訳する例外
interfaces/    core を外へ出すアダプター
  webapi/        FastAPI のルーターと組み立て
  mcp/           MCP サーバーと API キー認証
  cli/           端末向けのコマンド
main.py        ASGI のエントリポイント
tests/
```

Dependencies point one way: `interfaces/` depends on `core/`, never the reverse.
Adding a capability means adding it to `TodoService` first, then exposing it from each
interface that needs it.
