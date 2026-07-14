import type { TodoRepository } from '../../domain/repositories/todo-repository'

export class DeleteTodo {
  private readonly repository: TodoRepository

  constructor(repository: TodoRepository) {
    this.repository = repository
  }

  execute(id: number): Promise<void> {
    return this.repository.delete(id)
  }
}
