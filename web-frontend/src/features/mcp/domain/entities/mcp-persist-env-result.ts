/** キーの環境変数を永続化した結果。changed が false の項目は既に設定済みだったことを表す。 */
export interface McpPersistEnvResult {
  readonly envVar: string
  readonly zshrcPath: string
  readonly zshrcChanged: boolean
  /** macOS 以外では null。 */
  readonly launchAgentPath: string | null
  readonly launchAgentChanged: boolean
  /** launchctl setenv を即時実行できたか。 */
  readonly launchctlApplied: boolean
}
