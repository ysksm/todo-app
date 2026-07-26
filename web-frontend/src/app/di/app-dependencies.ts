import type { McpDependencies } from '@/features/mcp/di/mcp-dependencies'
import type { TodoDependencies } from '@/features/todo/di/todo-dependencies'

export interface AppDependencies {
  readonly todo: TodoDependencies
  readonly mcp: McpDependencies
}
