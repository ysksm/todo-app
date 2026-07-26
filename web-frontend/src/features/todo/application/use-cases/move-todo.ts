import type { Todo, TodoMove } from '../../domain/entities/todo'
import type { TodoRepository } from '../../domain/repositories/todo-repository'

export class MoveTodo {
  private readonly repository: TodoRepository

  constructor(repository: TodoRepository) {
    this.repository = repository
  }

  execute(todo: TodoMove): Promise<Todo> {
    return this.repository.move(todo)
  }
}
