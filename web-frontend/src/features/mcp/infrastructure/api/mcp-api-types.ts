export interface McpConnectionResponse {
  server_name: string
  url: string
  header_name: string
  api_key: string | null
  is_local_request: boolean
  add_command: string
  client_config: string
  connector_url: string
  codex_config: string
  codex_env_command: string
  note: string | null
}
