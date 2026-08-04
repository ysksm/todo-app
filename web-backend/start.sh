#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

# .env があれば読み込む（HOST / PORT / SSL_* / MCP_* を上書きできる）
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

# SSL_CERTFILE / SSL_KEYFILE を両方設定すると HTTPS で終端する。
# 例: mkcert localhost 127.0.0.1 で作った証明書を指定する。
set -- --reload --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}"
if [ -n "${SSL_CERTFILE:-}" ] && [ -n "${SSL_KEYFILE:-}" ]; then
  set -- "$@" --ssl-certfile "$SSL_CERTFILE" --ssl-keyfile "$SSL_KEYFILE"
fi

# トンネルやリバースプロキシ越し（cloudflared / ngrok など）で
# X-Forwarded-Proto / Host からクライアントの見た目の URL を復元する。
set -- "$@" --proxy-headers --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-127.0.0.1}"

exec uv run uvicorn main:app "$@"
