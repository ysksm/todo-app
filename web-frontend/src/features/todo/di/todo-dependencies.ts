import type { CreateTodo } from '../application/use-cases/create-todo'
import type { DeleteTodo } from '../application/use-cases/delete-todo'
import type { ListTodos } from '../application/use-cases/list-todos'
import type { UpdateTodo } from '../application/use-cases/update-todo'

export interface TodoDependencies {
  readonly listTodos: ListTodos
  readonly createTodo: CreateTodo
  readonly updateTodo: UpdateTodo
  readonly deleteTodo: DeleteTodo
}
