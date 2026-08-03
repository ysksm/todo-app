# todo-app

親子関係を持つ TODO を、リストとマインドマップの 2 つのビューで扱えるアプリ。
同じ機能を Web API・MCP・CLI の 3 つのインターフェースから操作できる。

- `web-backend/` — 全機能を持つ `core/` と、それを外へ出す `interfaces/`（webapi / mcp / cli）
- `web-frontend/` — React 19 + Redux Toolkit + Vite の SPA

変更はサーバーから SSE（`GET /api/todos/events`）で通知され、開いている
クライアントは自動で一覧を取り直す。Web API 経由でも MCP 経由でも同じ通知が流れる。

## 起動

フロントエンドをビルドしてバックエンドから配信する:

```sh
./build_and_start.sh
```

開発中は 2 つを別々に動かす:

```sh
cd web-backend && ./start.sh     # http://127.0.0.1:8000
cd web-frontend && npm run dev   # http://localhost:3000 （/api を 8000 番へプロキシ）
```

## 親子関係

TODO は親を 0 個または 1 個持ち、同じ親の中で並び順（`position`）を保つ。
親を持たない TODO はルートで、複数存在してよい。
親を削除すると、その子孫もまとめて削除される。

## タスクの種類

各 TODO は種類を 1 つ持つ（API では `type`、既定は `task`）。

| 種類 | 値 |
| --- | --- |
| Product | `product` |
| Epic | `epic` |
| UserStory | `user_story` |
| Task | `task` |
| SubTask | `subtask` |
| Bug | `bug` |

`Product > Epic > UserStory > Task > SubTask` は上下の決まった 1 本の階層で、
親は必ず子より上位でなければならない。

- 階層飛ばしは作れる — Product の直下に Task を置いてよい
- 逆向きは作れない — Task の下に Epic は置けない
- 同じ階層どうしも作れない — Task の下に Task は置けない
- ルートにはどの種類でも置ける
- Bug は階層の外。どの種類の下にも置けるが、Bug 自身は子を持てない

この決まりは追加・移動・種類の変更のすべてで効き、破る操作は 400（CLI / MCP ではエラー）になる。
判定はバックエンドの `core/models/todo_type.py` が唯一の決定元で、画面はそもそも選べない
種類を出さないようにしているだけ。

種類を持たずに保存された古いデータは `task` として読む。読み込み時に階層の妥当性は問わない
（既存の入れ子を壊さないため）。合わない組み合わせは、次にその TODO を動かす／種類を変える
ときに直すことになる。

詳しい仕様は [docs/mindmap-todo/](docs/mindmap-todo/) を参照。
ブラウザで読む場合は [docs/mindmap-todo/index.html](docs/mindmap-todo/index.html) を開く。

バックエンドの core / interfaces 分離は [docs/interfaces/](docs/interfaces/)
（[HTML 版](docs/interfaces/index.html)）にまとめてある。

## マインドマップのキー操作

ヘッダーの「マインドマップ」タブに切り替えると、左から右へ枝が伸びるトーナメント表として
タスクを操作できる。ビュー内で <kbd>?</kbd> を押すと同じ一覧が出る。

| キー | 動作 |
| --- | --- |
| `→` | 子タスクへ移動（折りたたみ中なら展開） |
| `←` | 親タスクへ移動 |
| `↑` / `↓` | 同じ親の兄弟タスクへ移動 |
| `Home` / `End` | 兄弟の先頭 / 末尾へ移動 |
| `F2` | タイトルを編集（編集中は `Enter` で確定、`Esc` で取り消し） |
| `Enter` | 兄弟タスクを追加（いま居るタスクと同じ種類） |
| `Tab` | 子タスクを追加（1 つ下の階層の種類。Bug の下には追加できない） |
| `Delete` / `BS` | タスクを削除（子タスクも削除。確認あり） |
| `Space` | 完了・未完了を切り替え |

## インターフェース

機能はすべて `web-backend/core/` の `TodoService` にあり、3 つのアダプターが同じ
サービスを呼ぶ。どこから変更しても同じデータを見る。

| インターフェース | 入口 | 用途 |
| --- | --- | --- |
| Web API | `/api/todos` | この SPA と外部の HTTP クライアント |
| MCP | `/mcp`（認証キー必須） | AI クライアントからの操作 |
| CLI | `python -m interfaces.cli` | 端末・スクリプトからの操作 |

### MCP をクライアントに追加する

UI の「MCP で連携する」パネルを開くと、そのまま貼り付けられるコマンドが出る。
手で組み立てる場合は次のとおり。

```sh
claude mcp add --transport http todo-app http://127.0.0.1:8000/mcp \
  --header "Authorization: Bearer $(cat web-backend/data/mcp_api_key)"
```

認証キーは `MCP_API_KEY` で指定でき、未設定なら初回起動時に
`web-backend/data/mcp_api_key` へ自動生成される。詳細は
[web-backend/README.md](web-backend/README.md) を参照。

### CLI

```sh
cd web-backend
uv run python -m interfaces.cli tree
uv run python -m interfaces.cli add "アプリを作る" --type product
uv run python -m interfaces.cli add "バックエンド" --parent 1 --type epic
uv run python -m interfaces.cli update 2 --type user_story
```

## テスト

```sh
cd web-backend && uv run pytest
cd web-frontend && npm test
```
