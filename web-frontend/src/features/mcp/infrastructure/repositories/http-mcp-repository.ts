import type { HttpClient } from '@/shared/infrastructure/http/http-client'
import type { McpConnection } from '../../domain/entities/mcp-connection'
import type { McpRepository } from '../../domain/repositories/mcp-repository'
import type { McpConnectionResponse } from '../api/mcp-api-types'

export class HttpMcpRepository implements McpRepository {
  private readonly httpClient: HttpClient

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient
  }

  async getConnection(): Promise<McpConnection> {
    const response = await this.httpClient.request<McpConnectionResponse>('/api/mcp/connection')
    return toMcpConnection(response)
  }
}

function toMcpConnection(response: McpConnectionResponse): McpConnection {
  return {
    serverName: response.server_name,
    url: response.url,
    headerName: response.header_name,
    apiKey: response.api_key,
    isLocalRequest: response.is_local_request,
    addCommand: response.add_command,
    clientConfig: response.client_config,
    note: response.note,
  }
}
