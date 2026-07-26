import type { Todo, TodoDraft, TodoMove, TodoUpdate } from '../entities/todo'

export interface TodoRepository {
  list(): Promise<readonly Todo[]>
  create(draft: TodoDraft): Promise<Todo>
  update(todo: TodoUpdate): Promise<Todo>
  move(todo: TodoMove): Promise<Todo>
  delete(id: number): Promise<void>
}
