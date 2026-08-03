#!/usr/bin/env bash
# ビルド済みバイナリに対する総合スモークテスト。
#
#   ./test/smoke.sh            # bin/todo-api を自動で起動して実行
#   ./test/smoke.sh --no-start # すでに動いているサーバに対して実行
#
# 埋め込んだ静的コンテンツが元ファイルと 1 バイトも違わないことまで確認する。
set -uo pipefail
cd "$(dirname "$0")/.."

BASE=${BASE:-http://127.0.0.1:8000}
DIST=${DIST:-../web-frontend/dist}
AUTO_START=1
[ "${1:-}" = "--no-start" ] && AUTO_START=0

if [ ! -d "$DIST" ]; then
  echo "dist が見つかりません: $DIST" >&2
  echo "  cd ../web-frontend && npm install && npx vite build" >&2
  exit 1
fi

JS=$(cd "$DIST" && ls assets/*.js)
CSS=$(cd "$DIST" && ls assets/*.css)

server_pid=""
cleanup() { [ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null; }
trap cleanup EXIT

if [ "$AUTO_START" = "1" ]; then
  [ -x bin/todo-api ] || { echo "bin/todo-api がありません。npm run build を先に実行してください" >&2; exit 1; }
  ./bin/todo-api >/dev/null 2>&1 &
  server_pid=$!
  for _ in $(seq 1 50); do
    curl -s -o /dev/null "$BASE/api/todos" && break
    sleep 0.1
  done
fi

pass=0; fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then pass=$((pass+1)); printf 'ok   %-44s %s\n' "$1" "$2";
  else fail=$((fail+1)); printf 'FAIL %-44s expected=[%s] actual=[%s]\n' "$1" "$2" "$3"; fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
hdr() { local h=$1; shift; curl -s -D - -o /dev/null "$@" | tr -d '\r' | grep -i "^$h:" | head -1 | sed "s/^[^:]*: *//I"; }
sha() { shasum -a 256 | cut -d' ' -f1; }

echo "== 静的コンテンツ =="
check "GET /"                       200 "$(code $BASE/)"
check "GET / content-type"          "text/html; charset=utf-8" "$(hdr content-type $BASE/)"
check "GET /index.html"             200 "$(code $BASE/index.html)"
check "GET /favicon.svg"            200 "$(code $BASE/favicon.svg)"
check "GET /favicon.svg type"       "image/svg+xml" "$(hdr content-type $BASE/favicon.svg)"
check "GET js"                      200 "$(code $BASE/$JS)"
check "GET js type"                 "text/javascript; charset=utf-8" "$(hdr content-type $BASE/$JS)"
check "GET css type"                "text/css; charset=utf-8" "$(hdr content-type $BASE/$CSS)"

echo "== 埋め込み内容のバイト一致 =="
for f in index.html favicon.svg icons.svg "$JS" "$CSS"; do
  want=$(sha < "$DIST/$f")
  check "sha256 $f (gzip)"     "$want" "$(curl -s --compressed "$BASE/$f" | sha)"
  check "sha256 $f (identity)" "$want" "$(curl -s -H 'Accept-Encoding: identity' "$BASE/$f" | sha)"
done

echo "== Content-Length / HEAD =="
size=$(wc -c < "$DIST/$JS" | tr -d ' ')
check "identity Content-Length"     "$size" "$(hdr content-length -H 'Accept-Encoding: identity' $BASE/$JS)"
check "HEAD status"                 200 "$(code -I $BASE/$JS)"
check "HEAD 本文は空"                0 "$(curl -s --head -o /dev/null -w '%{size_download}' $BASE/$JS)"
check "HEAD Content-Length"         "$size" "$(curl -s -I -H 'Accept-Encoding: identity' $BASE/$JS | tr -d '\r' | grep -i '^content-length:' | sed 's/^[^:]*: *//I')"

echo "== gzip ネゴシエーション =="
check "gzip"                        "gzip" "$(hdr content-encoding -H 'Accept-Encoding: gzip' $BASE/$JS)"
check "gzip;q=0.5"                  "gzip" "$(hdr content-encoding -H 'Accept-Encoding: gzip;q=0.5' $BASE/$JS)"
check "gzip;q=0 は拒否"              "" "$(hdr content-encoding -H 'Accept-Encoding: gzip;q=0' $BASE/$JS)"
check "br, gzip"                    "gzip" "$(hdr content-encoding -H 'Accept-Encoding: br, gzip' $BASE/$JS)"
check "br;q=1.0, gzip;q=0"          "" "$(hdr content-encoding -H 'Accept-Encoding: br;q=1.0, gzip;q=0' $BASE/$JS)"
check "*"                           "gzip" "$(hdr content-encoding -H 'Accept-Encoding: *' $BASE/$JS)"
check "*;q=0"                       "" "$(hdr content-encoding -H 'Accept-Encoding: *;q=0' $BASE/$JS)"
check "identity"                    "" "$(hdr content-encoding -H 'Accept-Encoding: identity' $BASE/$JS)"
check "Vary"                        "Accept-Encoding" "$(hdr vary $BASE/$JS)"
gzlen=$(hdr content-length -H 'Accept-Encoding: gzip' $BASE/$JS)
check "gzip の方が小さい"            "yes" "$([ "$gzlen" -lt "$size" ] && echo yes || echo no)"
check "非圧縮対象は gzip しない"      "" "$(hdr content-encoding -H 'Accept-Encoding: gzip' $BASE/index.html)"

echo "== キャッシュ / ETag =="
check "assets は immutable"          "public, max-age=31536000, immutable" "$(hdr cache-control $BASE/$JS)"
check "index.html は no-cache"       "no-cache" "$(hdr cache-control $BASE/)"
check "その他は 1 時間"               "public, max-age=3600" "$(hdr cache-control $BASE/favicon.svg)"
etag=$(hdr etag $BASE/favicon.svg)
check "ETag あり"                    "yes" "$([ -n "$etag" ] && echo yes || echo no)"
check "If-None-Match -> 304"        304 "$(code -H "If-None-Match: $etag" $BASE/favicon.svg)"
check "W/ 付き -> 304"               304 "$(code -H "If-None-Match: W/$etag" $BASE/favicon.svg)"
check "カンマ区切り -> 304"          304 "$(code -H "If-None-Match: \"x\", $etag" $BASE/favicon.svg)"
check "* -> 304"                    304 "$(code -H 'If-None-Match: *' $BASE/favicon.svg)"
check "不一致 -> 200"                200 "$(code -H 'If-None-Match: "nope"' $BASE/favicon.svg)"
check "304 は本文なし"               0 "$(curl -s -o /dev/null -w '%{size_download}' -H "If-None-Match: $etag" $BASE/favicon.svg)"
check "gzip と identity で ETag 別"  "different" \
  "$([ "$(hdr etag -H 'Accept-Encoding: gzip' $BASE/$JS)" != "$(hdr etag -H 'Accept-Encoding: identity' $BASE/$JS)" ] && echo different || echo same)"

echo "== ルーティング =="
idxsha=$(sha < "$DIST/index.html")
check "SPA フォールバック /todos"     200 "$(code $BASE/todos)"
check "フォールバック本文"            "$idxsha" "$(curl -s $BASE/todos | sha)"
check "存在しないアセットは 404"      404 "$(code $BASE/assets/missing.js)"
check "存在しない .png は 404"        404 "$(code $BASE/nope.png)"
check "クエリ付き"                   200 "$(code "$BASE/index.html?v=1")"
check "パーセントエンコード"          200 "$(code $BASE/%69ndex.html)"
check "traversal 本文は index.html"   "$idxsha" "$(curl -s --path-as-is $BASE/../../etc/passwd | sha)"
check "traversal で漏れなし"          "no" "$(curl -s --path-as-is $BASE/../../etc/passwd | grep -q 'root:' && echo yes || echo no)"
check "%2e%2e も同様"                "$idxsha" "$(curl -s --path-as-is $BASE/%2e%2e/%2e%2e/etc/passwd | sha)"
check "traversal + 拡張子は 404"      404 "$(code --path-as-is $BASE/../../etc/hosts.txt)"
check "重複スラッシュ"                200 "$(code --path-as-is $BASE//index.html)"
check "POST 静的 -> 405"             405 "$(code -X POST $BASE/favicon.svg)"
check "405 の Allow"                 "GET, HEAD" "$(hdr allow -X POST $BASE/favicon.svg)"

echo "== API =="
check "GET /api/todos"              200 "$(code $BASE/api/todos)"
check "POST /api/todos"             200 "$(code -X POST -H 'Content-Type: application/json' -d '{"title":"t1","description":"d","completed":false}' $BASE/api/todos)"
check "POST title のみ"              200 "$(code -X POST -H 'Content-Type: application/json' -d '{"title":"t2"}' $BASE/api/todos)"
check "POST 不正ボディ -> 422"       422 "$(code -X POST -H 'Content-Type: application/json' -d '{"nope":1}' $BASE/api/todos)"
check "GET /api/unknown -> 404"     404 "$(code $BASE/api/unknown)"
check "/api/unknown は JSON"         "application/json" "$(hdr content-type $BASE/api/unknown)"
check "DELETE /api/todos -> 405"    405 "$(code -X DELETE $BASE/api/todos)"
check "/api は SPA に落ちない"        "application/json" "$(hdr content-type $BASE/api/todos)"
check "作成した TODO が一覧に出る"    "yes" "$(curl -s $BASE/api/todos | grep -q '"title":"t1"' && echo yes || echo no)"
check "UTF-8 の TODO"                "yes" "$(curl -s -X POST -H 'Content-Type: application/json' -d '{"title":"買い物","description":"牛乳","completed":false}' $BASE/api/todos | grep -q '"title":"買い物"' && echo yes || echo no)"

echo "== SSE 変更通知 =="
check "GET /api/todos/events type"  "text/event-stream" \
  "$(curl -s -N --max-time 1 -D - -o /dev/null "$BASE/api/todos/events" | tr -d '\r' | grep -i '^content-type:' | head -1 | sed 's/^[^:]*: *//I')"
check "DELETE events -> 405"        405 "$(code -X DELETE $BASE/api/todos/events)"
sse_out=$(mktemp)
curl -s -N --max-time 3 "$BASE/api/todos/events" > "$sse_out" &
sse_pid=$!
sleep 0.5
curl -s -X POST -H 'Content-Type: application/json' -d '{"title":"sse"}' "$BASE/api/todos" > /dev/null
wait "$sse_pid"
check "接続直後のコメント"            "yes" "$(grep -q '^: connected' "$sse_out" && echo yes || echo no)"
check "todos_changed が届く"         "yes" "$(grep -q '^event: todos_changed' "$sse_out" && echo yes || echo no)"
check "action は created"            "yes" "$(grep -q '"action":"created"' "$sse_out" && echo yes || echo no)"
rm -f "$sse_out"

echo
echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
