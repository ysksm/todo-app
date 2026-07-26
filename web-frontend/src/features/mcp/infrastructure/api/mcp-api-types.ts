export interface McpConnectionResponse {
  server_name: string
  url: string
  header_name: string
  api_key: string | null
  is_local_request: boolean
  add_command: string
  client_config: string
  note: string | null
}
