"""OAuth の承認画面。

MCP クライアント（Claude アプリ・ChatGPT など）が接続を要求すると
ここへリダイレクトされてくる。MCP API キーを入力して許可すると、
クライアントへ認可コードを返す。
"""

from __future__ import annotations

from fastapi import APIRouter, Form, Request
from starlette.responses import HTMLResponse, RedirectResponse

from interfaces.mcp.oauth import ConsentError, TodoOAuthProvider

# 承認画面を iframe に埋めて許可を騙し取られない（クリックジャッキング）ようにする。
CONSENT_PAGE_HEADERS = {
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'none'",
}


def consent_page(html: str, status_code: int = 200) -> HTMLResponse:
    return HTMLResponse(html, status_code=status_code, headers=CONSENT_PAGE_HEADERS)


def create_consent_router(provider: TodoOAuthProvider) -> APIRouter:
    router = APIRouter(prefix="/oauth", tags=["oauth"])

    @router.get("/consent", include_in_schema=False)
    def show_consent(request: Request, txn: str) -> HTMLResponse:
        try:
            client_name = provider.transaction_client_name(txn)
        except ConsentError as error:
            return consent_page(render_error(str(error)), status_code=400)
        return consent_page(render_form(txn, client_name))

    @router.post("/consent", include_in_schema=False, response_model=None)
    def submit_consent(
        request: Request,
        txn: str = Form(...),
        api_key: str = Form(...),
    ) -> HTMLResponse | RedirectResponse:
        try:
            redirect_url = provider.complete_consent(txn, api_key.strip())
        except ConsentError as error:
            try:
                client_name = provider.transaction_client_name(txn)
            except ConsentError:
                return consent_page(render_error(str(error)), status_code=400)
            return consent_page(render_form(txn, client_name, error=str(error)), status_code=401)
        # 303 で認可コード付きの redirect_uri（クライアント側）へ戻す。
        return RedirectResponse(redirect_url, status_code=303)

    return router


PAGE_STYLE = """
  body { display: grid; min-height: 100svh; place-items: center; margin: 0;
         background: #f4f7f5; color: #15211c;
         font-family: -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif; }
  main { width: min(calc(100% - 32px), 420px); padding: 28px;
         border: 1px solid #bdc9c1; border-radius: 8px; background: #fff; }
  h1 { margin: 0 0 12px; font-size: 20px; }
  p { margin: 0 0 16px; color: #496053; font-size: 14px; }
  strong { color: #15211c; }
  label { display: block; margin-bottom: 6px; color: #33483b; font-size: 13px; font-weight: 600; }
  input { width: 100%; box-sizing: border-box; margin-bottom: 8px; padding: 10px;
          border: 1px solid #93a99b; border-radius: 4px; font-size: 14px; }
  .hint { margin: 0 0 16px; color: #65786b; font-size: 12px; }
  button { width: 100%; padding: 10px; border: 0; border-radius: 4px;
           background: #2f694c; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
  .error { margin-bottom: 16px; padding: 10px 12px; border-left: 3px solid #b06a2c;
           background: #fbf2e9; color: #7a4a1c; font-size: 13px; }
"""


def render_form(transaction_id: str, client_name: str, error: str | None = None) -> str:
    error_html = f'<p class="error">{escape_html(error)}</p>' if error else ""
    return f"""<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Todo MCP の接続を許可</title><style>{PAGE_STYLE}</style></head>
<body><main>
  <h1>接続を許可しますか？</h1>
  <p><strong>{escape_html(client_name)}</strong> がこの Todo の MCP サーバーへの接続を要求しています。
     許可するには MCP API キーを入力してください。</p>
  {error_html}
  <form method="post" action="consent">
    <input type="hidden" name="txn" value="{escape_html(transaction_id)}">
    <label for="api-key">MCP API キー</label>
    <input id="api-key" name="api_key" type="password" autocomplete="off" autofocus required>
    <p class="hint">Todo アプリの 設定 → 「MCP API キー」でコピーしたキーを、そのまま貼り付けてください。</p>
    <button type="submit">許可する</button>
  </form>
</main></body></html>"""


def render_error(message: str) -> str:
    return f"""<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Todo MCP の接続を許可</title><style>{PAGE_STYLE}</style></head>
<body><main><h1>承認できません</h1><p>{escape_html(message)}</p></main></body></html>"""


def escape_html(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
