import type { GetMcpConnection } from '../application/use-cases/get-mcp-connection'

export interface McpDependencies {
  readonly getMcpConnection: GetMcpConnection
}
