# 技術仕様: TODO の親子関係とマインドマップビュー

対象リポジトリ: `web-backend`（FastAPI + JSONL 永続化）/ `web-frontend`（React 19 + Redux Toolkit + Vite）

既存のレイヤ構成（domain / application / infrastructure / presentation）と DI の流儀は維持する。

> **補足（実装後）** — この文書はマインドマップ機能を設計した時点のもの。実装後に
> バックエンドを core / interfaces へ分離したため、ファイルの位置が変わっている。
>
> | この文書での位置 | 現在の位置 |
> | --- | --- |
> | `models/todo.py` | `core/models/todo.py` |
> | `repositories/todo_repository.py` | `core/repositories/todo_repository.py` |
> | `repositories/errors.py` | `core/errors.py` |
> | `api/todos.py` | `interfaces/webapi/todos.py` |
>
> API とデータモデルの仕様そのものは変わっていない。現在の構成は
> [../interfaces/architecture.md](../interfaces/architecture.md) を参照。
>
> その後 `TodoBase` に種類（`type`: product / epic / user_story / task / subtask / bug）が
> 増え、親子として成立する組み合わせに制限が入った。決まりは
> `core/models/todo_type.py` と [README](../../README.md#タスクの種類) を参照。
> ここに書いてある「親子関係は position と parent_id だけで決まる」という前提には、
> 種類の上下関係というもう 1 つの条件が加わっている。

---

## 1. データモデル

### 1.1 バックエンド (`web-backend/models/todo.py`)

```python
class TodoBase(BaseModel):
    title: str
    description: str = ""
    completed: bool = False


class TodoCreate(TodoBase):
    parent_id: int | None = None   # 追加先の親。None ならルート


class TodoUpdate(TodoBase):
    """PUT /api/todos/{id} 用。親子関係は変更しない。"""


class TodoMove(BaseModel):
    parent_id: int | None = None   # 移動先の親
    position: int | None = None    # 兄弟内の挿入位置。None なら末尾


class Todo(TodoBase):
    id: int
    parent_id: int | None = None
    position: int = 0              # 同じ親を持つ兄弟の中での 0 始まりの並び順
```

**設計判断**

- 親子関係の変更を `PUT` に混ぜず、専用の `PATCH .../move` に分離する。
  既存フロントの `PUT`（title / description / completed のみ送信）が親子関係を壊さないようにするため。
- `position` は「同じ親の中で 0 から連番」という不変条件を持つ。永続化のたびに正規化する。

### 1.2 永続化 (`repositories/todo_repository.py`)

JSONL 全読み・全書き戻しの現行方式を維持する。

- **読み込み時の正規化** — 既存データには `parent_id` / `position` が無いため、
  `Todo.model_validate_json` のデフォルト（`parent_id=None`, `position=0`）で読み込んだうえで
  `_normalize(todos)` を通す。マイグレーションスクリプトは不要。
- `_normalize(todos)` の責務:
  1. 存在しない `parent_id` を指す TODO は孤児とみなし `parent_id = None` に倒す。
  2. 親ごとにグループ化し、`(position, ファイル出現順)` でソートして `position` を 0..n-1 に振り直す。
  3. 万一循環が残っていた場合、循環に含まれるノードを `parent_id = None` にしてルートへ戻す（データ破損時のフェイルセーフ）。
- 書き込み時も `_normalize` を通してから既存の tmp ファイル + `replace` で保存する。

**リポジトリの追加メソッド**

| メソッド | 内容 |
| --- | --- |
| `create(todo_create)` | `parent_id` を検証し、その親の末尾 `position` に追加 |
| `update(todo_id, todo_update)` | title / description / completed のみ更新。`parent_id` / `position` は保持 |
| `move(todo_id, move)` | 親と位置を変更。循環チェックあり |
| `delete(todo_id)` | **子孫ごとカスケード削除**。削除した id のリストを返す |
| `descendant_ids(todo_id)` | 子孫 id の集合。循環チェックと削除で共用 |

`move` の手順:

1. `todo_id` が存在しなければ `None` を返す（→ 404）。
2. `move.parent_id` が `todo_id` 自身、または `descendant_ids(todo_id)` に含まれるなら `CyclicMoveError` を送出（→ 400）。
3. `move.parent_id` が None 以外で存在しなければ `ParentNotFoundError`（→ 400）。
4. 旧兄弟から抜き、新兄弟の `position` 位置に挿入。`position=None` は末尾。範囲外の値は clamp する。
5. `_normalize` して保存。

### 1.3 フロントエンド (`domain/entities/todo.ts`)

```ts
export interface Todo {
  readonly id: number
  readonly title: string
  readonly description: string
  readonly completed: boolean
  readonly parentId: number | null
  readonly position: number
}

export interface TodoDraft {
  readonly title: string
  readonly description: string
  readonly completed: boolean
  readonly parentId: number | null   // 追加
}

export interface TodoMove {
  readonly id: number
  readonly parentId: number | null
  readonly position: number | null
}
```

`TodoUpdate`（= `id` + title/description/completed）は現状のまま。`normalizeTodoDraft` は `parentId` をそのまま透過させる。

---

## 2. API

ベースは既存の `/api/todos`。**フラットな配列を返す方式を維持し、木構造はフロント側で組み立てる**（サーバーとクライアントで木の構築ロジックを二重に持たないため）。

| メソッド | パス | リクエスト | レスポンス |
| --- | --- | --- | --- |
| `GET` | `/api/todos` | — | `Todo[]`（`parent_id`, `position` を含む） |
| `GET` | `/api/todos/{id}` | — | `Todo` |
| `POST` | `/api/todos` | `TodoCreate` | `Todo` |
| `PUT` | `/api/todos/{id}` | `TodoUpdate` | `Todo` |
| `PATCH` | `/api/todos/{id}/move` | `TodoMove` | `Todo` |
| `DELETE` | `/api/todos/{id}` | — | `204`（子孫もカスケード削除） |

`GET /api/todos` の並び順は「深さ優先・`position` 昇順」で返す。フロントの木構築を安定させ、レスポンスをそのまま目視デバッグしやすくするため。

エラー:

| 状況 | ステータス | detail |
| --- | --- | --- |
| 対象 TODO が無い | 404 | `Todo not found` |
| 指定した親が存在しない | 400 | `Parent todo not found` |
| 自分自身 or 子孫を親に指定 | 400 | `Cannot move a todo under its own descendant` |

`DELETE` がカスケードする点は API ドキュメント（`web-backend/README.md`）に明記する。

---

## 3. フロントエンド設計

### 3.1 ディレクトリ構成（追加分）

```
src/features/todo/
  domain/entities/
    todo-tree.ts            # TodoNode 型と木構築・走査
  domain/repositories/
    todo-repository.ts      # move() を追加
  application/use-cases/
    move-todo.ts            # 追加
  infrastructure/api/
    todo-api-types.ts       # parent_id / position を追加
  infrastructure/repositories/
    http-todo-repository.ts # snake_case <-> camelCase 変換、move() 実装
  presentation/
    components/mindmap/
      mindmap-view.tsx      # キャンバス、SVG コネクタ、キーイベント受け口
      mindmap-node.tsx      # 1 ノードの描画 + インライン編集
    hooks/
      use-mindmap-navigation.ts   # キー入力 -> 移動 / 編集 / 追加 / 削除
      use-mindmap-layout.ts       # 木 -> 座標
    store/todo-slice.ts     # viewMode / focusedTodoId / editingTodoId を追加
    mindmap.css
```

### 3.2 木構造 (`domain/entities/todo-tree.ts`)

純粋関数のみ。React にもストアにも依存させず、単体テストしやすくする。

```ts
export interface TodoNode {
  readonly todo: Todo
  readonly depth: number
  readonly children: readonly TodoNode[]
}

export function buildTodoTree(todos: readonly Todo[]): readonly TodoNode[]
export function flattenTree(roots: readonly TodoNode[]): readonly TodoNode[]
export function findNode(roots: readonly TodoNode[], id: number): TodoNode | null
export function findParent(roots: readonly TodoNode[], id: number): TodoNode | null
export function findSibling(roots, id, offset: 1 | -1): TodoNode | null
export function findFirstChild(roots, id): TodoNode | null
```

- `buildTodoTree` は親が見つからない TODO をルート扱いにする（サーバー側の正規化と同じ方針）。
- ルートは複数存在しうる（森）。ルート同士も `position` 順の「兄弟」として扱い、`↑` / `↓` で行き来できる。

### 3.3 レイアウト (`use-mindmap-layout.ts`)

左→右のトーナメント表。tidy tree の簡易版（Reingold–Tilford の 1 次元版）。

```
NODE_WIDTH = 220, NODE_HEIGHT = 44
H_GAP = 64   // 列間の水平距離
V_GAP = 12   // 葉の垂直間隔
```

- `x = depth * (NODE_WIDTH + H_GAP)`
- `y` は深さ優先で走査し、**葉に出会うたびに次のスロットを消費**する
  （`nextY += NODE_HEIGHT + V_GAP`）。
- 子を持つノードの `y` は **先頭の子と末尾の子の中点**。これでトーナメント表状に揃う。
- 出力は `Map<todoId, {x, y}>` とキャンバス全体の `{width, height}`。
- ノード間の接続線は SVG の `<path>` で、親の右端 → 子の左端を結ぶ 3 次ベジエ:
  `M px,py C px+H_GAP/2,py px-H_GAP/2+cx,cy cx,cy`
- 折りたたまれたノードの子はレイアウト計算から除外する（`collapsedIds: Set<number>` を入力に取る）。

### 3.4 状態管理 (`presentation/store/todo-slice.ts`)

既存 `TodoStoreState` に追加:

```ts
viewMode: 'list' | 'mindmap'
focusedTodoId: number | null    // マインドマップ上のカーソル位置
editingTodoId: number | null    // F2 でインライン編集中のノード
collapsedIds: number[]          // 折りたたみ（クライアント内のみ）
```

追加アクション: `viewModeChanged`, `focusMoved`, `editingStarted`, `editingStopped`, `collapseToggled`。

`requestSucceeded` は既存の `selectedTodoId` と同様に、`focusedTodoId` / `editingTodoId` が
消えた TODO を指していたら `null` に戻す。`collapsedIds` からも消えた id を取り除く。

### 3.5 キーボード操作 (`use-mindmap-navigation.ts`)

キーイベントはキャンバスのコンテナ（`tabIndex={0}`）で受け、`focusedTodoId` を動かす
**roving focus** 方式。個々のノードに DOM フォーカスを配らないことで、
数百ノードでもイベントハンドラが 1 つで済む。

| キー | 通常モード | 編集モード |
| --- | --- | --- |
| `→` | 折りたたみ中なら展開のみ。展開済みなら先頭の子へ。子が無ければ何もしない | （input に委譲：カーソル移動） |
| `←` | 親へ。ルートなら何もしない | （input に委譲） |
| `↑` | ひとつ上の兄弟へ。先頭なら何もしない | — |
| `↓` | ひとつ下の兄弟へ。末尾なら何もしない | — |
| `F2` | 編集開始（既存タイトルを全選択） | — |
| `Enter` | 同じ親に兄弟を新規作成し、そのノードを編集モードへ | 保存して編集終了 |
| `Shift+Enter` | — | 改行せず保存（`Enter` と同じ。誤爆防止） |
| `Tab` | 子を新規作成し、編集モードへ（`preventDefault` 必須） | 保存して編集終了 |
| `Delete` / `Backspace` | 子孫がある場合は確認のうえ削除。削除後は直前の兄弟 → 無ければ親にフォーカス | — |
| `Space` | `completed` をトグル | — |
| `Esc` | — | 変更を破棄して編集終了 |
| `Home` / `End` | 兄弟の先頭 / 末尾へ | — |

- 新規作成は空タイトルでは API を叩けない（`normalizeTodoDraft` が弾く）ため、
  **クライアント側に仮ノードを置いてから編集させ、確定時に `POST`** する。
  空のまま `Esc` / blur した場合は仮ノードを破棄する。
- 移動キーは常に `preventDefault()`（ページスクロール抑止）。
- 端に到達した場合はフォーカスを動かさない（ラップアラウンドしない）。

### 3.6 アクセシビリティ

- キャンバス: `role="tree"`, `aria-activedescendant={focusedTodoId}`
- ノード: `role="treeitem"`, `aria-level={depth + 1}`, `aria-expanded`（子がある場合のみ）, `aria-selected`
- キー割り当ての一覧をビュー内のヘルプ（`?` キー or 凡例）として表示する。

### 3.7 ビュー切り替え (`todo-page.tsx`)

ヘッダーに「リスト / マインドマップ」のタブを置き、`viewMode` で切り替える。
どちらのビューも同じ `useTodos` のデータを参照するため、片方の変更が即もう片方に反映される。

既存のリストビューは、親子関係を持つ TODO をインデント付きで（深さ優先順に）表示する程度の
最小変更にとどめる。

---

## 4. テスト方針

| 対象 | 種類 | 内容 |
| --- | --- | --- |
| `TodoRepository` | pytest | `create` の position 採番 / `move` の並び替え / 循環拒否 / カスケード削除 / 旧フォーマット JSONL の読み込み |
| API | pytest + `TestClient` | 各エンドポイントのステータスコードとエラー detail |
| `todo-tree.ts` | vitest | 木構築（孤児・複数ルート）、`findSibling` / `findFirstChild` の境界 |
| `use-mindmap-layout.ts` | vitest | 単一ノード / 深いネスト / 折りたたみ時の座標 |
| `mindmap-view.tsx` | vitest + Testing Library | 各キーでフォーカスが期待どおり動くこと、`F2` で input が出ること |

バックエンドには現状テストが無いため、`pytest` の導入もタスクに含める。

---

## 5. 段階的な進め方

1. バックエンド（モデル → リポジトリ → API → テスト）
2. フロントエンドのドメイン・インフラ層（型、木構築、`move` 配線）
3. マインドマップの描画（キー操作なし）
4. キーボード操作
5. 仕上げ（リストビューのインデント、ヘルプ、ドキュメント更新）

各段階でアプリが壊れずに動く状態を保つ。`web-backend` の変更を先に入れても、
既存フロントは `parent_id` を無視するだけで従来どおり動作する。
