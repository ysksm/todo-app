# web-backend-ts

`web-backend`（FastAPI + Python）の TypeScript 版です。
[scriptc](https://scriptc.dev/) で C を経由してネイティブバイナリにコンパイルして動かします。

- **TODO API**（Python 版と同じ `GET/POST /api/todos`、ポート `8000`）
- **静的コンテンツ配信**（`web-frontend` のビルド結果を配信。SPA フォールバック、ETag/304、gzip、キャッシュ制御つき）
- **バイナリ埋め込み**（静的コンテンツはバイナリに埋め込まれる。実行時にファイルを一切読まない）

Node / V8 は不要で、成果物は 1MB 弱の実行ファイル 1 個だけです。

```
$ ./bin/todo-api
TODO API listening on http://127.0.0.1:8000
embedded static assets: 5
```

## 必要なもの

- Node.js + npm（**ビルド時のみ**。実行には不要）
- clang（macOS は Xcode Command Line Tools に同梱）

## セットアップと起動

```bash
npm install

# 配信するフロントエンドをビルドしておく
cd ../web-frontend && npm install && npx vite build && cd -

./start.sh
```

`start.sh` は「アセット埋め込み → C 経由でビルド → 起動」をまとめて行います。
起動後 http://127.0.0.1:8000/ を開けば、バイナリに埋め込まれた React アプリがそのまま動きます。

個別に実行する場合:

```bash
npm run embed    # ../web-frontend/dist を src/assets.generated.ts に変換
npm run build    # C を経由してビルド（bin/main.c と bin/todo-api が生成される）
npm start        # ビルド済みバイナリを起動
npm run dev      # コンパイルして即実行（開発用）
npm test         # ビルド済みバイナリに対するスモークテスト
npm run coverage # 静的にコンパイルできる割合を表示
```

`../web-frontend/dist` が無い場合は警告を出したうえで、静的コンテンツなし（API のみ）のバイナリになります。

## 構成

```
scripts/embed-assets.mjs   dist/ を TypeScript に変換するジェネレータ（Node で実行）
src/assets.generated.ts    生成物（git 管理外）。アセットの base64 とメタデータ
src/static.ts              静的コンテンツ配信
src/main.ts                エントリポイント。API ルーティング
test/smoke.sh              バイナリに対する総合テスト（72 項目）
```

## バイナリ埋め込みの仕組み

```
web-frontend/dist/*  ──(scripts/embed-assets.mjs)──▶  src/assets.generated.ts
                                                        （base64 文字列）
                          ──(scriptc --backend c)──▶  bin/main.c
                                                        （C の文字列リテラル）
                          ──(clang)────────────────▶  bin/todo-api
```

ジェネレータはビルド時に次を計算して埋め込みます。実行時には base64 の展開しか行いません。

- Content-Type（拡張子から判定）
- ETag（内容の SHA-256 の先頭 128bit）
- gzip 済みのバイト列（テキスト系かつ 1KiB 以上、9 割未満に縮む場合のみ）

実測値（このリポジトリのフロントエンド）:

| | サイズ |
| --- | --- |
| 配信するファイル | 5 個 / 203.8 KiB |
| 埋め込みデータ（gzip 変種込み） | 266.4 KiB |
| `src/assets.generated.ts` | 366 KiB |
| `bin/main.c` | 464 KiB |
| `bin/todo-api` | 984 KiB（アセットなしだと 628 KiB） |
| ビルド時間 | 約 5.5 秒 |
| 起動〜リクエスト受付まで | 約 6 ms（266 KiB の base64 展開を含む） |

base64 は元データの約 1.33 倍になるため、バイナリを小さくしたい場合は `node scripts/embed-assets.mjs --no-gzip` で
gzip 変種を落とせます（その代わり `Content-Encoding: gzip` は返さなくなります）。

アセットを差し替えたら `npm run embed` からやり直してください（バイナリに焼き込まれているため、
実行ファイルだけ残しても更新されません）。

## API

Python 版と同じインターフェースです。

| Method | Path | 説明 |
| --- | --- | --- |
| GET | `/api/todos` | TODO 一覧取得 |
| POST | `/api/todos` | TODO 作成 |
| GET | `/api/todos/events` | 変更通知の SSE ストリーム |

リクエストボディ（`description` と `completed` は省略可能。pydantic のデフォルトと同じ挙動）:

```json
{ "title": "買い物", "description": "牛乳", "completed": false }
```

不正なボディは `422`、`/api/*` の未定義パスは JSON の `404`、未対応メソッドは `405` を返します。
`/api/*` は静的ハンドラより先に処理されるので、SPA フォールバックに飲み込まれることはありません。
TODO はプロセスのメモリ上にのみ保持されます（Python 版と同じく再起動で消えます）。

### 変更通知（SSE）

Python 版と同じく、TODO が作られると `GET /api/todos/events` に `todos_changed` が流れます。

```
event: todos_changed
data: {"action":"created","ids":[5]}
```

ペイロードは合図にすぎず、クライアントは受信したら `GET /api/todos` を取り直す想定です。
待機中は 15 秒ごとに `: keep-alive` コメントを送ります。

実装は Python 版（購読者リストへの push）と異なり、**変更カウンタ方式**です。
scriptc では `ServerResponse` を配列や Map に保持できないため（下表参照）、各 SSE 接続が
自分のクロージャ内の `setInterval`（250ms）でグローバルなカウンタを監視し、増えていたら
イベントを書き出します。250ms 間に複数の変更が起きた場合は最後の 1 件に合流しますが、
クライアントは全件取り直すので問題になりません。

## 静的コンテンツ配信の仕様

| 項目 | 挙動 |
| --- | --- |
| ルーティング | `/` → `/index.html`、`/foo/` → `/foo/index.html`、それ以外はパス完全一致 |
| SPA フォールバック | 未知のパスは `index.html` を 200 で返す。ただし拡張子付き（`/assets/missing.js` など）は 404 |
| メソッド | `GET` / `HEAD`。実在するパスへのそれ以外は `405` + `Allow: GET, HEAD` |
| Content-Type | 拡張子から判定。テキスト系には `; charset=utf-8` を付与 |
| Content-Length | 常に**バイト長**（UTF-8 の文字数ではない） |
| ETag / 304 | 全アセットに付与。`If-None-Match`（`*`、カンマ区切り、`W/` 接頭辞）に対応 |
| gzip | `Accept-Encoding: gzip` のときのみ。`gzip;q=0` は拒否として扱う。`Vary: Accept-Encoding` を付与 |
| キャッシュ | `/assets/*` は `immutable`（Vite のハッシュ付きファイル）、`index.html` は `no-cache`、その他は 1 時間 |
| パス正規化 | クエリ・フラグメント除去、`%XX` 復号、`.` / `..` の解決 |

ファイルシステムを触らないため、パストラバーサルでホストのファイルが漏れることはありません
（正規化後の Map 検索に失敗し、404 か SPA フォールバックになります）。

## 動作確認

```bash
npm test          # bin/todo-api を起動して 72 項目を検証し、終了時に停止する
./test/smoke.sh --no-start   # すでに起動済みのサーバに対して実行
```

検証内容は、配信データの SHA-256 が元ファイルと一致すること、Content-Length / HEAD、
gzip ネゴシエーション（`gzip;q=0` や `*` を含む 8 パターン）、ETag と 304、キャッシュ制御、
SPA フォールバックとパストラバーサル、API の各ステータス、SSE 変更通知
（購読中の POST で `todos_changed` が届くこと）です。

ポートが使用中の場合はメッセージを出して終了コード 1 で止まります。

```
$ ./bin/todo-api
failed to start server on port 8000: listen EADDRINUSE: address already in use :::8000
```

## scriptc に合わせた実装上の注意

scriptc は TypeScript の静的な部分集合しか受け付けません。実装時にぶつかった制約は以下のとおりです。

| 制約 | 対応 |
| --- | --- |
| `any` が使えない | `JSON.parse` の結果は具体的な型へキャスト |
| キャストは実行時に検証され、必須フィールド欠落は例外（余分なフィールドは許容） | `description` / `completed` は個別に try/catch してデフォルト値を入れる |
| `data` イベントの引数は `Buffer` 型必須（SC1090） | `(chunk: Buffer) => ...` で受ける |
| `Map<string, Buffer>` は不可（SC2009 / SC1090 / SC2020） | パス → 添字の `Map<string, number>` と `Buffer[]` に分ける |
| `Uint8Array.from` が未対応（SC2020） | `%XX` の復号は `Buffer.from(hex, "hex")` で行う |
| `zlib` は `deflateSync` / `inflateSync` のみ（`gzipSync` は未対応） | gzip はビルド時（Node 側）に作って埋め込む |
| `if (v)` は空文字を弾いてしまう | `Map.get` の結果は `if (v === undefined)` で判定 |
| `ServerResponse[]` / `Map<number, ServerResponse>` は不可（SC2009 / SC2020） | SSE は購読者リストを持たず、変更カウンタを接続ごとの `setInterval` で監視して配信 |

`npm run coverage` は現状 **260/260 statements = 100% 静的**で、動的エンジン（`--dynamic`）へのフォールバックはありません。

## 制限

- Windows では scriptc の `net` / `http` スタックが未対応のため、このバイナリは macOS / Linux 向けです。
- `Range` リクエスト（部分取得）には対応していません。動画配信などが必要なら追加実装が要ります。
