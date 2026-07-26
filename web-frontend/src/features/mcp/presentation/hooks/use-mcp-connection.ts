import { useCallback, useEffect, useState } from 'react'
import type { McpDependencies } from '../../di/mcp-dependencies'
import type { McpConnection } from '../../domain/entities/mcp-connection'

interface McpConnectionState {
  connection: McpConnection | null
  isLoading: boolean
  error: string | null
  reload(): Promise<void>
}

export function useMcpConnection(dependencies: McpDependencies): McpConnectionState {
  const [connection, setConnection] = useState<McpConnection | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    try {
      setConnection(await dependencies.getMcpConnection.execute())
      setError(null)
    } catch {
      setError('MCP の接続情報を取得できませんでした。')
    } finally {
      setIsLoading(false)
    }
  }, [dependencies])

  useEffect(() => {
    void reload()
  }, [reload])

  return { connection, isLoading, error, reload }
}
