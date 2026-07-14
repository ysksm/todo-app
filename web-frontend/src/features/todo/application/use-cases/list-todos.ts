import type { Todo } from '../../domain/entities/todo'
import type { TodoRepository } from '../../domain/repositories/todo-repository'

export class ListTodos {
  private readonly repository: TodoRepository

  constructor(repository: TodoRepository) {
    this.repository = repository
  }

  execute(): Promise<readonly Todo[]> {
    return this.repository.list()
  }
}
