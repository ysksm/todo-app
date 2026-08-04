export interface McpConnection {
  readonly serverName: string
  readonly url: string
  /** 認証キーを載せるヘッダー名。 */
  readonly headerName: string
  /** ローカルからの参照時のみ実際のキー。それ以外は null。 */
  readonly apiKey: string | null
  readonly isLocalRequest: boolean
  /** Claude Code に登録するコマンド。 */
  readonly addCommand: string
  /** 他の MCP クライアント向けの設定 JSON。 */
  readonly clientConfig: string
  /** Claude アプリのカスタムコネクタ用 URL（ヘッダー不要、キーは ?key= で URL に載る）。 */
  readonly connectorUrl: string
  readonly note: string | null
}
