import type { HttpClient } from '@/shared/infrastructure/http/http-client'
import { GetMcpConnection } from '../application/use-cases/get-mcp-connection'
import { HttpMcpRepository } from '../infrastructure/repositories/http-mcp-repository'
import type { McpDependencies } from './mcp-dependencies'

export function createMcpDependencies(httpClient: HttpClient): McpDependencies {
  const repository = new HttpMcpRepository(httpClient)

  return {
    getMcpConnection: new GetMcpConnection(repository),
  }
}
