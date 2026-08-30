# web-backend-rb — Rails 版 TODO バックエンド

階層構造の TODO を扱う Ruby on Rails アプリ。
人間はブラウザの HTML 画面から、AI や外部クライアントは JSON API（`/api/todos`）から
同じデータを操作できる。将来 SPA 化する場合はこの JSON API をそのまま使う。

- Ruby 4.0.6 / Rails 8.1.3.1（2026-08 時点の最新安定版）
- DB は SQLite（`storage/` 配下）
- ゼロから作り直す手順は [docs/STEP_BY_STEP.md](docs/STEP_BY_STEP.md) を参照

## 起動

```sh
cd web-backend-rb
./start.sh            # http://127.0.0.1:8100 （PORT で変更可）
```

初回はサンプルデータを入れると画面がわかりやすい:

```sh
bin/rails db:seed
```

## 階層構造

TODO は 0 個または 1 個の親を持つツリー。種類は上から順に:

| 種類 | 値 |
| --- | --- |
| プロジェクト | `project` |
| エピック | `epic` |
| フィーチャー | `feature` |
| ユーザーストーリー | `user_story` |
| タスク | `task` |

ルール（`app/models/todo.rb` が唯一の決定元）:

- 親は必ず子より上位の種類でなければならない
- 階層飛ばしは作れる — `project` の直下に `task` を置いてよい
- 逆向き・同種は作れない — `task` の下に `epic` は不可
- 例外: **`task` の下に `task` は置ける**（タスクは何段でも入れ子にできる）
- ルートにはどの種類でも置ける
- 種類の変更は、既存の子と矛盾する場合は拒否される
- 親を削除すると子孫もまとめて削除される

破る操作は HTML ではエラー表示、API では 422 になる。

## JSON API

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/todos` | 一覧（`?parent_id=` で絞り込み、`?root=true` でルートのみ） |
| GET | `/api/todos/tree` | ルートから子孫までネストしたツリー |
| GET | `/api/todos/:id` | 1 件取得（直接の `children` を含む） |
| POST | `/api/todos` | 作成 |
| PATCH | `/api/todos/:id` | 更新（`parent_id` の付け替え、種類変更も可） |
| DELETE | `/api/todos/:id` | 削除（子孫もまとめて削除） |

```sh
# 作成
curl -X POST http://127.0.0.1:8100/api/todos \
  -H "Content-Type: application/json" \
  -d '{"todo":{"title":"アプリを作る","todo_type":"project"}}'

# 子を作成
curl -X POST http://127.0.0.1:8100/api/todos \
  -H "Content-Type: application/json" \
  -d '{"todo":{"title":"バックエンド","todo_type":"epic","parent_id":1}}'

# ツリー取得
curl http://127.0.0.1:8100/api/todos/tree
```

`status` は `open` / `in_progress` / `done` の 3 値。

## テスト

```sh
bin/rails test
```
