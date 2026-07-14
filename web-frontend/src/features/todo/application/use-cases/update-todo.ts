import {
  normalizeTodoDraft,
  type Todo,
  type TodoUpdate,
} from '../../domain/entities/todo'
import type { TodoRepository } from '../../domain/repositories/todo-repository'

export class UpdateTodo {
  private readonly repository: TodoRepository

  constructor(repository: TodoRepository) {
    this.repository = repository
  }

  async execute(todo: TodoUpdate): Promise<Todo> {
    return this.repository.update({
      id: todo.id,
      ...normalizeTodoDraft(todo),
    })
  }
}
