# 実装タスク: TODO の親子関係とマインドマップビュー

仕様は [spec.md](./spec.md)、背景は [requirements.md](./requirements.md) を参照。
`[ ]` を `[x]` にして進捗を管理する。依存関係は「前提」欄に記載。

---

## フェーズ 1 — バックエンド: データモデル

### [ ] BE-1. Todo モデルに親子関係と並び順を追加
- **対象**: `web-backend/models/todo.py`
- `TodoBase` / `TodoCreate`(`parent_id`) / `TodoUpdate` / `TodoMove` / `Todo`(`parent_id`, `position`) に分割する。
- **完了条件**: 既存の import (`from models.todo import Todo, TodoCreate`) が壊れず、`TodoUpdate` / `TodoMove` が追加されている。

### [ ] BE-2. リポジトリの正規化と親子対応
- **前提**: BE-1
- **対象**: `web-backend/repositories/todo_repository.py`
- `_normalize()` を実装（孤児をルートへ、親ごとに `position` を 0..n-1 へ振り直し、循環をルートへ倒す）。読み書き両方で通す。
- `create` を「指定親の末尾に追加」に変更。
- `update` が `parent_id` / `position` を保持することを保証。
- **完了条件**: `parent_id` を持たない既存の `data/todos.jsonl` を読み込んでも例外が出ず、全件がルートとして返る。

### [ ] BE-3. move / カスケード削除の実装
- **前提**: BE-2
- **対象**: `web-backend/repositories/todo_repository.py`
- `descendant_ids(todo_id)`、`move(todo_id, move)`、カスケードする `delete(todo_id)`。
- 循環時は `CyclicMoveError`、親不在は `ParentNotFoundError`（`repositories/errors.py` に定義）。
- **完了条件**: 自分の子孫を親に指定すると例外、親を削除すると子孫も JSONL から消える。

---

## フェーズ 2 — バックエンド: API

### [ ] BE-4. エンドポイントの追加・調整
- **前提**: BE-3
- **対象**: `web-backend/api/todos.py`
- `GET /api/todos` を深さ優先・`position` 昇順で返す。
- `POST` を `TodoCreate`（`parent_id` 付き）に対応。
- `PUT` を `TodoUpdate` に切り替え。
- `PATCH /api/todos/{id}/move` を追加。
- 例外 → HTTP ステータスの変換（404 / 400）。
- **完了条件**: 仕様書の API 表とエラー表のとおりに応答する。

### [ ] BE-5. バックエンドのテスト整備
- **前提**: BE-4
- **対象**: `web-backend/pyproject.toml`（`pytest`, `httpx` を dev 依存に）、`web-backend/tests/`
- `test_todo_repository.py`: position 採番 / move / 循環拒否 / カスケード削除 / 旧フォーマット読み込み。
- `test_todos_api.py`: `TestClient` で各エンドポイントとエラーを検証。
- リポジトリは一時ディレクトリの JSONL を使う（`TodoRepository(data_file=tmp_path/...)`）。
- **注意**: `api/todos.py` はモジュールレベルで `repository` を生成しているため、テスト用に差し替えられるよう FastAPI の `Depends` 化を検討する。
- **完了条件**: `uv run pytest` が通る。

---

## フェーズ 3 — フロントエンド: ドメイン / インフラ層

### [ ] FE-1. Todo 型に parentId / position を追加
- **前提**: BE-4
- **対象**: `domain/entities/todo.ts`, `infrastructure/api/todo-api-types.ts`, `infrastructure/repositories/http-todo-repository.ts`
- `TodoResponse` に `parent_id` / `position`、`toTodo` で camelCase へ変換。
- `TodoDraft` に `parentId` を追加し、`create` の body で `parent_id` として送る。
- **完了条件**: `npm run build` が通り、既存画面の挙動が変わらない。

### [ ] FE-2. 木構造ユーティリティ
- **前提**: FE-1
- **対象**: `domain/entities/todo-tree.ts` + `todo-tree.test.ts`
- `buildTodoTree` / `flattenTree` / `findNode` / `findParent` / `findSibling` / `findFirstChild`。
- ルートは複数可。孤児はルート扱い。
- **完了条件**: vitest でツリー構築と走査の境界ケースが通る。

### [ ] FE-3. move ユースケースの配線
- **前提**: FE-1
- **対象**: `domain/repositories/todo-repository.ts`, `http-todo-repository.ts`, `application/use-cases/move-todo.ts`, `di/todo-dependencies.ts`, `di/create-todo-dependencies.ts`
- `move(todo: TodoMove): Promise<Todo>` を追加し、`PATCH /api/todos/{id}/move` を呼ぶ。
- **完了条件**: DI 経由で `moveTodo.execute(...)` が呼べる。

---

## フェーズ 4 — フロントエンド: マインドマップ描画

### [ ] FE-4. ストアの拡張
- **前提**: FE-2
- **対象**: `presentation/store/todo-slice.ts` + `todo-slice.test.ts`
- `viewMode` / `focusedTodoId` / `editingTodoId` / `collapsedIds` と対応アクション。
- `requestSucceeded` で消えた id を各状態から掃除する。
- **完了条件**: 既存の slice テストが通り、新しい状態遷移のテストが追加されている。

### [ ] FE-5. レイアウト計算
- **前提**: FE-2
- **対象**: `presentation/hooks/use-mindmap-layout.ts` + テスト
- 左→右のトーナメント表配置（葉でスロット消費、親は子の中点）。折りたたみを考慮。
- 出力: `Map<number, {x, y}>` とキャンバスサイズ。
- **完了条件**: 単一ノード / 深いネスト / 折りたたみ時の座標がテストで固定されている。

### [ ] FE-6. マインドマップの描画
- **前提**: FE-4, FE-5
- **対象**: `presentation/components/mindmap/mindmap-view.tsx`, `mindmap-node.tsx`, `presentation/mindmap.css`
- 絶対配置のノード + SVG のベジエ接続線。
- ノードは title / 完了状態 / 子の数を表示。折りたたみトグル付き。
- `role="tree"` / `role="treeitem"` と `aria-*` 属性。
- **完了条件**: 親子を持つデータを渡すと、左→右のトーナメント表として描画される（キー操作はまだ無くてよい）。

### [ ] FE-7. ビュー切り替え
- **前提**: FE-6
- **対象**: `presentation/pages/todo-page.tsx`, `presentation/hooks/use-todos.ts`
- ヘッダーに「リスト / マインドマップ」タブ。
- `useTodos` に `move` と木構造の導出を追加。
- **完了条件**: タブでビューが切り替わり、どちらのビューでも同じデータが見える。

---

## フェーズ 5 — キーボード操作

### [ ] FE-8. フォーカス移動
- **前提**: FE-7
- **対象**: `presentation/hooks/use-mindmap-navigation.ts`
- `→` 子へ（折りたたみ中は展開のみ） / `←` 親へ / `↑` `↓` 兄弟 / `Home` `End` 兄弟の端。
- 端ではラップアラウンドしない。移動キーは `preventDefault`。
- roving focus（コンテナ 1 つでイベントを受ける）。
- **完了条件**: Testing Library で各キーの `focusedTodoId` 遷移が検証されている。

### [ ] FE-9. F2 によるインライン編集
- **前提**: FE-8
- **対象**: `mindmap-node.tsx`, `use-mindmap-navigation.ts`
- `F2` で input に切り替え、既存タイトルを全選択。
- `Enter` で保存（`updateTodo`）、`Esc` で破棄、blur でも保存。
- 保存中は入力を無効化し、失敗時は編集状態を維持する。
- **完了条件**: `F2` → 入力 → `Enter` でタイトルが更新される。

### [ ] FE-10. Enter / Tab による追加と Delete による削除
- **前提**: FE-9
- **対象**: `use-mindmap-navigation.ts`, `mindmap-view.tsx`
- `Enter`: 同じ親の直下（現在ノードの次の位置）に仮ノードを作り編集モードへ。確定時に `POST` → `PATCH move` で位置を合わせる。
- `Tab`: 子として仮ノードを作り編集モードへ。`preventDefault` を忘れない。
- 空タイトルで確定 / `Esc` した場合は仮ノードを破棄する。
- `Delete` / `Backspace`: 子孫があるときは確認ダイアログ。削除後は直前の兄弟 → 無ければ親へフォーカス。
- `Space`: `completed` トグル。
- **完了条件**: キーボードだけで「追加 → 命名 → 子を追加 → 削除」が一通りできる。

---

## フェーズ 6 — 仕上げ

### [ ] FE-11. リストビューの階層表示
- **前提**: FE-2
- **対象**: `presentation/components/todo-list.tsx`, `todo-list-item.tsx`
- 深さ優先順に並べ、`depth` に応じたインデントを付ける。
- **完了条件**: 親子関係がリストビューでも判別できる。

### [ ] FE-12. キーボードヘルプ
- **前提**: FE-10
- **対象**: `mindmap-view.tsx`
- 凡例パネル（`?` でトグル）にキー割り当て一覧を表示。
- **完了条件**: マインドマップ上で操作方法が確認できる。

### [ ] DOC-1. ドキュメント更新
- **前提**: BE-5, FE-10
- **対象**: `README.md`, `web-backend/README.md`
- API の一覧（`PATCH move` の追加、`DELETE` がカスケードする点）とマインドマップのキー操作を記載。
- **完了条件**: README だけ読めば API とキー操作が分かる。

---

## 実行順の目安

```
BE-1 → BE-2 → BE-3 → BE-4 → BE-5
                        └→ FE-1 → FE-2 → FE-4 ┐
                                  └→ FE-3     ├→ FE-6 → FE-7 → FE-8 → FE-9 → FE-10 → FE-12
                                  └→ FE-5 ────┘                                  └→ DOC-1
                                  └→ FE-11
```
