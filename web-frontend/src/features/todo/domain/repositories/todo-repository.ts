import type { Todo, TodoDraft, TodoUpdate } from '../entities/todo'

export interface TodoRepository {
  list(): Promise<readonly Todo[]>
  create(draft: TodoDraft): Promise<Todo>
  update(todo: TodoUpdate): Promise<Todo>
  delete(id: number): Promise<void>
}
