"""ASGI のエントリポイント（`uvicorn main:app`）。

インターフェースの中身は interfaces/ 配下にある。
- HTTP API と MCP: interfaces/webapi/app.py
- CLI: interfaces/cli/main.py（`uv run python -m interfaces.cli`）
"""

from interfaces.webapi.app import create_app

app = create_app()
