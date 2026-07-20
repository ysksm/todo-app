#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

# .env があれば読み込む（HOST / PORT を上書きできる）
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

exec uv run uvicorn main:app --reload --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}"
