#!/bin/sh
# Rails 版バックエンドを起動する。http://127.0.0.1:8100
set -e
cd "$(dirname "$0")"

bundle check >/dev/null 2>&1 || bundle install
bin/rails db:prepare
exec bin/rails server -p "${PORT:-8100}"
