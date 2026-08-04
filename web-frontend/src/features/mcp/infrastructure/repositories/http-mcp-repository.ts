import type { HttpClient } from '@/shared/infrastructure/http/http-client'
import type { McpConnection } from '../../domain/entities/mcp-connection'
import type { McpPersistEnvResult } from '../../domain/entities/mcp-persist-env-result'
import type { McpRepository } from '../../domain/repositories/mcp-repository'
import type { McpConnectionResponse, McpPersistEnvResponse } from '../api/mcp-api-types'

export class HttpMcpRepository implements McpRepository {
  private readonly httpClient: HttpClient

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient
  }

  async getConnection(): Promise<McpConnection> {
    const response = await this.httpClient.request<McpConnectionResponse>('/api/mcp/connection')
    return toMcpConnection(response)
  }

  async persistEnv(): Promise<McpPersistEnvResult> {
    const response = await this.httpClient.request<McpPersistEnvResponse>(
      '/api/mcp/persist-env',
      { method: 'POST' },
    )
    return {
      envVar: response.env_var,
      zshrcPath: response.zshrc_path,
      zshrcChanged: response.zshrc_changed,
      launchAgentPath: response.launch_agent_path,
      launchAgentChanged: response.launch_agent_changed,
      launchctlApplied: response.launchctl_applied,
    }
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
    connectorUrl: response.connector_url,
    codexConfig: response.codex_config,
    codexEnvCommand: response.codex_env_command,
    persistEnvScript: response.persist_env_script,
    note: response.note,
  }
}
