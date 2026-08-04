import type { McpDependencies } from '../../di/mcp-dependencies'
import { useMcpConnection } from '../hooks/use-mcp-connection'
import { CopyableCommand } from './copyable-command'
import '../mcp.css'

interface McpSettingsProps {
  dependencies: McpDependencies
}

/** MCP クライアントごとの登録方法をまとめた設定セクション。 */
export function McpSettings({ dependencies }: McpSettingsProps) {
  const { connection, isLoading, error } = useMcpConnection(dependencies)

  return (
    <section className="mcp-settings" aria-labelledby="mcp-settings-heading">
      <h2 id="mcp-settings-heading">MCP で連携する</h2>

      {isLoading && <p role="status">接続情報を読み込み中...</p>}
      {error && <p role="alert" className="mcp-panel__error">{error}</p>}

      {connection && (
        <>
          <p className="mcp-panel__lead">
            この TODO を AI クライアントから操作できます。使うクライアントの手順で
            サーバー <code>{connection.serverName}</code> を登録してください。
          </p>

          <dl className="mcp-panel__details">
            <div>
              <dt>エンドポイント</dt>
              <dd><code>{connection.url}</code></dd>
            </div>
            <div>
              <dt>認証</dt>
              <dd>
                <code>{connection.headerName}: Bearer &lt;キー&gt;</code>、または OAuth
                （コネクタ登録時に認可フローが自動で始まります）
              </dd>
            </div>
          </dl>

          {connection.apiKey && (
            <>
              <CopyableCommand
                label="MCP API キー（認可画面で入力するキー）"
                value={connection.apiKey}
                secret={connection.apiKey}
              />
              <p className="mcp-panel__note" role="note">
                「コピー」を押すとキーだけがコピーされます。認可画面にはそれを
                そのまま貼り付けてください（Authorization: などの文字列を手で
                入力する必要はありません）。
              </p>
            </>
          )}

          <section className="mcp-client" aria-labelledby="mcp-client-claude-code">
            <h3 id="mcp-client-claude-code">Claude Code</h3>
            <p>ターミナルで次のコマンドを実行します。</p>
            <CopyableCommand
              label="登録コマンド"
              value={connection.addCommand}
              secret={connection.apiKey}
            />
          </section>

          <section className="mcp-client" aria-labelledby="mcp-client-claude-app">
            <h3 id="mcp-client-claude-app">Claude アプリ</h3>
            <ol className="mcp-client__steps">
              <li>設定 → コネクタ → 「カスタムコネクタを追加」で下の URL を登録する</li>
              <li>接続時に開く認可画面で上の MCP API キーを入力し「許可する」を押す</li>
            </ol>
            <CopyableCommand label="カスタムコネクタ用 URL" value={connection.connectorUrl} />
          </section>

          <section className="mcp-client" aria-labelledby="mcp-client-chatgpt">
            <h3 id="mcp-client-chatgpt">ChatGPT</h3>
            <ol className="mcp-client__steps">
              <li>設定 → コネクタ → 詳細設定で「開発者モード」を有効にする</li>
              <li>「コネクタを作成」で下の URL を MCP サーバー URL として登録する（認証は「OAuth」を選択）</li>
              <li>接続時に開く認可画面で上の MCP API キーを入力し「許可する」を押す</li>
            </ol>
            <CopyableCommand label="コネクタ用 URL" value={connection.connectorUrl} />
          </section>

          <section className="mcp-client" aria-labelledby="mcp-client-codex">
            <h3 id="mcp-client-codex">Codex CLI</h3>
            <p>
              <code>~/.codex/config.toml</code> に次を追記します。キーは Bearer トークン
              として送られます（HTTP サーバー対応には新しめの Codex CLI が必要です）。
            </p>
            <CopyableCommand
              label="config.toml に追記"
              value={connection.codexConfig}
              secret={connection.apiKey}
            />
          </section>

          <section className="mcp-client" aria-labelledby="mcp-client-other">
            <h3 id="mcp-client-other">その他のクライアント</h3>
            <CopyableCommand
              label="設定 JSON"
              value={connection.clientConfig}
              secret={connection.apiKey}
            />
          </section>

          <p className="mcp-panel__note" role="note">
            Claude アプリ・ChatGPT はそれぞれのサーバーから接続するため、公開 HTTPS の
            URL が必要です。トンネル（cloudflared / ngrok など）で公開し、URL のホスト部分を
            トンネルの URL に読み替えてください（詳細は web-backend/README.md）。
          </p>

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
    </section>
  )
}
