import type { McpConnection } from '../../domain/entities/mcp-connection'
import type { McpRepository } from '../../domain/repositories/mcp-repository'

export class GetMcpConnection {
  private readonly repository: McpRepository

  constructor(repository: McpRepository) {
    this.repository = repository
  }

  execute(): Promise<McpConnection> {
    return this.repository.getConnection()
  }
}
