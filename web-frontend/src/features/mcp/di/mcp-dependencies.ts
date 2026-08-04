import type { GetMcpConnection } from '../application/use-cases/get-mcp-connection'
import type { PersistMcpEnv } from '../application/use-cases/persist-mcp-env'

export interface McpDependencies {
  readonly getMcpConnection: GetMcpConnection
  readonly persistMcpEnv: PersistMcpEnv
}
