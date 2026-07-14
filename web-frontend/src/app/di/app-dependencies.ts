import type { TodoDependencies } from '@/features/todo/di/todo-dependencies'

export interface AppDependencies {
  readonly todo: TodoDependencies
}
