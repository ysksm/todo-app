#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# フロントエンドをビルド（成果物は web-frontend/dist に出力される）
cd "$SCRIPT_DIR/web-frontend"
npm run build

# バックエンドを起動（web-frontend/dist を静的配信する）
exec "$SCRIPT_DIR/web-backend/start.sh"
