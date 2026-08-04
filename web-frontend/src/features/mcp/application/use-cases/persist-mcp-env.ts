import type { McpPersistEnvResult } from '../../domain/entities/mcp-persist-env-result'
import type { McpRepository } from '../../domain/repositories/mcp-repository'

export class PersistMcpEnv {
  private readonly repository: McpRepository

  constructor(repository: McpRepository) {
    this.repository = repository
  }

  execute(): Promise<McpPersistEnvResult> {
    return this.repository.persistEnv()
  }
}
