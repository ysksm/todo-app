import type { Todo } from './todo'
import type { TodoStatus } from './todo-status'
import type { TodoType } from './todo-type'

/** 一覧の絞り込み条件。null / 空文字の項目は絞らない。 */
export interface TodoFilter {
  readonly status: TodoStatus | null
  readonly type: TodoType | null
  readonly query: string
}

export function matchesFilter(todo: Todo, filter: TodoFilter): boolean {
  if (filter.status !== null && todo.status !== filter.status) {
    return false
  }
  if (filter.type !== null && todo.type !== filter.type) {
    return false
  }

  const query = filter.query.trim().toLowerCase()
  if (query === '') {
    return true
  }
  return (
    todo.title.toLowerCase().includes(query) || todo.description.toLowerCase().includes(query)
  )
}
