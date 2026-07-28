#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# フロントエンドの dist を TypeScript に埋め込み、C 経由でネイティブビルドして起動する。
# dist が無い場合は静的コンテンツなし（API のみ）でビルドされる。
node scripts/embed-assets.mjs
npx scriptc build src/main.ts --backend c --keep-c -o bin/todo-api
exec ./bin/todo-api
