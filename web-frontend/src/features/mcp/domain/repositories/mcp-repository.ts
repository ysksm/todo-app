import type { McpConnection } from '../entities/mcp-connection'
import type { McpPersistEnvResult } from '../entities/mcp-persist-env-result'

export interface McpRepository {
  getConnection(): Promise<McpConnection>
  /** キーの環境変数を ~/.zshrc と LaunchAgent に永続化する（ローカル限定）。 */
  persistEnv(): Promise<McpPersistEnvResult>
}
