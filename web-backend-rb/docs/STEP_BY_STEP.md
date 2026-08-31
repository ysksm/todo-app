# 階層構造 TODO アプリをゼロから作る手順（Rails 練習用）

このドキュメントは `web-backend-rb` を作ったときの実際の手順を、
同じものをゼロから作り直せる形で残したもの。各ステップは上から順に実行する。

作るもの:

- Ruby on Rails 製の TODO アプリ
- TODO は `project > epic > feature > user_story > task` の階層構造
  （`task` の下には `task` を何段でも入れ子にできる）
- 人間向けの HTML 画面と、AI・SPA 向けの JSON API の両方を持つ

使ったバージョン（2026-08 時点の最新安定版。作業前に
[ruby-lang.org](https://www.ruby-lang.org/ja/downloads/) と
[rubyonrails.org](https://rubyonrails.org/) で最新を確認するとよい）:

- Ruby 4.0.6
- Rails 8.1.3.1

---

## Step 1. Ruby をインストールする

rbenv + ruby-build を使う。定義が古いと新しい Ruby が出てこないので、まず更新する。

```sh
# ruby-build の定義を最新化（rbenv のインストール先は環境に合わせる）
git -C "$(rbenv root)"/plugins/ruby-build pull

# インストールできるバージョンを確認
rbenv install -l

# 最新安定版をビルド（数分かかる）
MAKE_OPTS="-j$(nproc)" rbenv install 4.0.6
rbenv global 4.0.6
ruby -v   # => ruby 4.0.6
```

## Step 2. Rails をインストールする

```sh
gem install rails --no-document
rails -v   # => Rails 8.1.3.1
```

## Step 3. アプリを生成する

```sh
rails new web-backend-rb --skip-git --skip-kamal --skip-thruster --skip-ci --skip-docker
cd web-backend-rb
```

- `--skip-git` … 既存リポジトリの中に作るため
- `--skip-kamal --skip-thruster --skip-ci --skip-docker` … デプロイ関連は今回不要

DB は既定の SQLite。Rails 8 では DB ファイルは `storage/` 配下に置かれる。
生成された `.ruby-version` が使いたい Ruby と違う場合は書き換える:

```sh
echo "ruby-4.0.6" > .ruby-version
bundle install
```

## Step 4. Todo モデルを生成する

階層は「テーブルを種類ごとに分ける」のではなく、
**1 つの `todos` テーブル + 自己参照の `parent_id`** で表現する。
種類（project / epic / …）は文字列カラム 1 つで持つ。

```sh
bin/rails generate model Todo title:string description:text \
  todo_type:string status:string parent:references position:integer
```

生成されたマイグレーションを編集して、NOT NULL・デフォルト値・
自己参照の外部キー・並び順用インデックスを付ける:

```ruby
# db/migrate/XXXX_create_todos.rb
class CreateTodos < ActiveRecord::Migration[8.1]
  def change
    create_table :todos do |t|
      t.string :title, null: false
      t.text :description
      t.string :todo_type, null: false, default: "task"
      t.string :status, null: false, default: "open"
      t.references :parent, foreign_key: { to_table: :todos }  # 自己参照
      t.integer :position, null: false, default: 0

      t.timestamps
    end

    add_index :todos, [ :parent_id, :position ]
  end
end
```

ポイント:

- `t.references :parent` は既定だと `parents` テーブルを参照しようとするので
  `foreign_key: { to_table: :todos }` で自分自身に向ける
- `type` というカラム名は Rails の STI（単一テーブル継承）に予約されているため
  **`todo_type`** にする

```sh
bin/rails db:migrate
```

## Step 5. モデルに階層ルールを実装する

`app/models/todo.rb` に、関連・バリデーション・階層ルールをすべて集める
（ルールの決定元をモデル 1 か所にするのが大事。画面や API は選択肢を絞るだけ）。

実装する内容（全文はリポジトリの `app/models/todo.rb` を参照）:

1. **種類と順位の表**: `TYPE_LEVELS = { "project" => 0, "epic" => 1, "feature" => 2, "user_story" => 3, "task" => 4 }`
2. **自己参照の関連**:
   ```ruby
   belongs_to :parent, class_name: "Todo", optional: true
   has_many :children, -> { order(:position, :id) },
            class_name: "Todo", foreign_key: :parent_id,
            inverse_of: :parent, dependent: :destroy
   ```
   `dependent: :destroy` で「親を消したら子孫も消える」が実現できる
   （子の destroy がさらに孫の destroy を呼ぶので再帰的に消える）。
3. **親子の可否判定**を 1 つのクラスメソッドに集約:
   ```ruby
   def self.valid_parent_child?(parent_type, child_type)
     return true if parent_type.nil?                              # ルートは何でも可
     return true if parent_type == "task" && child_type == "task" # task の入れ子だけ例外
     TYPE_LEVELS[parent_type] < TYPE_LEVELS[child_type]           # 親が上位なら可（階層飛ばし OK）
   end
   ```
4. **バリデーション** 3 種:
   - `parent_must_be_higher_level` … 上の判定に反する親子は保存できない
   - `parent_must_not_be_self_or_descendant` … 親をたどって自分に戻ったら循環なので拒否
   - `children_must_stay_lower_level`（update 時のみ）… 子と矛盾する種類変更を拒否
5. **position の自動採番**: `before_create` で「同じ親の中の最大値 + 1」を入れる

## Step 6. ルーティング

```ruby
# config/routes.rb
Rails.application.routes.draw do
  root "todos#index"

  resources :todos do
    member { patch :toggle }        # 完了 <-> 未着手の切り替え
  end

  namespace :api, defaults: { format: :json } do
    get "todos/tree", to: "todos#tree"   # resources より先に書く（:id に食われないように）
    resources :todos, only: %i[index show create update destroy]
  end
end
```

## Step 7. HTML 用コントローラとビュー

`app/controllers/todos_controller.rb` は普通の CRUD + `toggle`。
ポイントだけ:

- `new` では `params[:parent_id]` で親を受け取り、
  親の `allowed_child_types` の先頭を種類の初期値にする
- ビューのツリー表示は**再帰パーシャル**で作る:
  `index.html.erb` がルート一覧を `_node.html.erb` に渡し、
  `_node.html.erb` が自分の子をまた `_node` で描画する
  ```erb
  <%= render partial: "node", collection: todo.children, as: :todo %>
  ```
- フォームの種類セレクトは、親が決まっていれば `parent.allowed_child_types` に絞る
  （最終的な強制はモデルのバリデーションがやる）
- 削除確認は Turbo なので `data: { turbo_confirm: "..." }`

ファイル:

- `app/views/todos/index.html.erb` … ツリー表示
- `app/views/todos/_node.html.erb` … 再帰パーシャル
- `app/views/todos/_form.html.erb` / `new` / `edit` / `show`
- `app/helpers/todos_helper.rb` … 種類・状態の日本語ラベル
- `app/assets/stylesheets/application.css` … スタイル（Propshaft がそのまま配信）
- レイアウトにヘッダーとフラッシュ表示を追加

## Step 8. JSON API 用コントローラ

SPA・AI クライアント向け。HTML 側と分けて `app/controllers/api/` に置く。

- `Api::BaseController < ActionController::API` … CSRF やビュー関連が不要なので
  `ActionController::API` を継承。`ActiveRecord::RecordNotFound` を 404 JSON に変換
- `Api::TodosController` … CRUD + `tree`。レスポンスはプレーンな Hash で組み立てる
  （`tree` は `todo_json(todo).merge(children: children.map { ... })` の再帰）
- バリデーションエラーは `{ errors: [...] }` の 422 で返す

## Step 9. テスト

- `test/fixtures/todos.yml` … project → epic → user_story → task → task の 5 段を用意
- `test/models/todo_test.rb` … 階層ルールを網羅
  （逆向き NG / 同種 NG / task 入れ子 OK / 階層飛ばし OK / 循環 NG / 種類変更の整合性 / カスケード削除 / position 採番）
- `test/controllers/todos_controller_test.rb` … HTML の CRUD と toggle
- `test/controllers/api/todos_controller_test.rb` … API の一覧・ツリー・作成・親の付け替え・422・404

```sh
bin/rails db:test:prepare test
```

## Step 10. シードと起動

```sh
bin/rails db:seed        # db/seeds.rb（find_or_create なので何度でも実行できる）
bin/rails server -p 8100
```

動作確認:

```sh
curl http://127.0.0.1:8100/up               # ヘルスチェック → 200
curl http://127.0.0.1:8100/api/todos/tree   # ツリー JSON
curl -X POST http://127.0.0.1:8100/api/todos \
  -H "Content-Type: application/json" \
  -d '{"todo":{"title":"タスク","todo_type":"task","parent_id":1}}'   # → 201
curl -X POST http://127.0.0.1:8100/api/todos \
  -H "Content-Type: application/json" \
  -d '{"todo":{"title":"逆向き","todo_type":"project","parent_id":2}}' # → 422
```

ブラウザで http://127.0.0.1:8100 を開くとツリー画面が出る。

---

## SPA 化するときの拡張ポイント

- JSON API はすでに `/api/todos` にあるので、フロントは
  `web-frontend` と同様に `/api` をプロキシすれば HTML 画面と並行して動かせる
- CORS が必要になったら `rack-cors` gem を追加して `config/initializers/cors.rb` を書く
- 認証を足すなら API 側（`Api::BaseController`）にトークン認証を集約する
- 更新通知が欲しくなったら Action Cable（生成済み）か SSE を検討する
