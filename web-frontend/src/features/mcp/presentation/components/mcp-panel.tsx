import { useState } from 'react'
import type { McpDependencies } from '../../di/mcp-dependencies'
import { useMcpConnection } from '../hooks/use-mcp-connection'
import { CopyableCommand } from './copyable-command'
import '../mcp.css'

interface McpPanelProps {
  dependencies: McpDependencies
}

export function McpPanel({ dependencies }: McpPanelProps) {
  const { connection, isLoading, error } = useMcpConnection(dependencies)
  const [isOpen, setIsOpen] = useState(false)

  return (
    <section className="mcp-panel" aria-labelledby="mcp-panel-heading">
      <button
        type="button"
        className="mcp-panel__toggle"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span id="mcp-panel-heading">MCP で連携する</span>
        <span aria-hidden>{isOpen ? '−' : '+'}</span>
      </button>

      {isOpen && (
        <div className="mcp-panel__body">
          {isLoading && <p role="status">接続情報を読み込み中...</p>}
          {error && <p role="alert" className="mcp-panel__error">{error}</p>}

          {connection && (
            <>
              <p className="mcp-panel__lead">
                この TODO を AI クライアントから操作できます。下のコマンドを実行して
                サーバー <code>{connection.serverName}</code> を追加してください。
              </p>

              <CopyableCommand
                label="Claude Code に追加"
                value={connection.addCommand}
                secret={connection.apiKey}
              />

              <CopyableCommand
                label="その他のクライアント（設定 JSON）"
                value={connection.clientConfig}
                secret={connection.apiKey}
              />

              <dl className="mcp-panel__details">
                <div>
                  <dt>エンドポイント</dt>
                  <dd><code>{connection.url}</code></dd>
                </div>
                <div>
                  <dt>認証ヘッダー</dt>
                  <dd><code>{connection.headerName}: Bearer &lt;キー&gt;</code></dd>
                </div>
              </dl>

              {connection.note && (
                <p className="mcp-panel__note" role="note">{connection.note}</p>
              )}
              {connection.apiKey && (
                <p className="mcp-panel__warning">
                  この認証キーはサーバーを操作できます。共有しないでください。
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
