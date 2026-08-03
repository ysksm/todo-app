import type { SubscribeToTodoChanges } from '../application/subscribe-to-todo-changes'
import type { CreateTodo } from '../application/use-cases/create-todo'
import type { DeleteTodo } from '../application/use-cases/delete-todo'
import type { ListTodos } from '../application/use-cases/list-todos'
import type { MoveTodo } from '../application/use-cases/move-todo'
import type { UpdateTodo } from '../application/use-cases/update-todo'

export interface TodoDependencies {
  readonly listTodos: ListTodos
  readonly createTodo: CreateTodo
  readonly updateTodo: UpdateTodo
  readonly moveTodo: MoveTodo
  readonly deleteTodo: DeleteTodo
  readonly subscribeToChanges: SubscribeToTodoChanges
}
