import type { McpConnection } from '../entities/mcp-connection'

export interface McpRepository {
  getConnection(): Promise<McpConnection>
}
