import type { HttpClient } from '@/shared/infrastructure/http/http-client'
import { CreateTodo } from '../application/use-cases/create-todo'
import { DeleteTodo } from '../application/use-cases/delete-todo'
import { ListTodos } from '../application/use-cases/list-todos'
import { UpdateTodo } from '../application/use-cases/update-todo'
import { HttpTodoRepository } from '../infrastructure/repositories/http-todo-repository'
import type { TodoDependencies } from './todo-dependencies'

export function createTodoDependencies(httpClient: HttpClient): TodoDependencies {
  const repository = new HttpTodoRepository(httpClient)

  return {
    listTodos: new ListTodos(repository),
    createTodo: new CreateTodo(repository),
    updateTodo: new UpdateTodo(repository),
    deleteTodo: new DeleteTodo(repository),
  }
}
