import { createMcpDependencies } from '@/features/mcp/di/create-mcp-dependencies'
import { createTodoDependencies } from '@/features/todo/di/create-todo-dependencies'
import { createSseTodoChangeSource } from '@/features/todo/infrastructure/events/sse-todo-change-source'
import { apiBaseUrl } from '@/shared/config/env'
import { FetchHttpClient } from '@/shared/infrastructure/http/fetch-http-client'
import type { AppDependencies } from './app-dependencies'

export function createAppDependencies(): AppDependencies {
  const httpClient = new FetchHttpClient(apiBaseUrl)

  return {
    todo: createTodoDependencies(httpClient, createSseTodoChangeSource(apiBaseUrl)),
    mcp: createMcpDependencies(httpClient),
  }
}
