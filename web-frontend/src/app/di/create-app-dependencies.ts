import { createTodoDependencies } from '@/features/todo/di/create-todo-dependencies'
import { apiBaseUrl } from '@/shared/config/env'
import { FetchHttpClient } from '@/shared/infrastructure/http/fetch-http-client'
import type { AppDependencies } from './app-dependencies'

export function createAppDependencies(): AppDependencies {
  const httpClient = new FetchHttpClient(apiBaseUrl)

  return {
    todo: createTodoDependencies(httpClient),
  }
}
