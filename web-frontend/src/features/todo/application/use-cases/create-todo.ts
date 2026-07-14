import {
  normalizeTodoDraft,
  type Todo,
  type TodoDraft,
} from '../../domain/entities/todo'
import type { TodoRepository } from '../../domain/repositories/todo-repository'

export class CreateTodo {
  private readonly repository: TodoRepository

  constructor(repository: TodoRepository) {
    this.repository = repository
  }

  async execute(draft: TodoDraft): Promise<Todo> {
    return this.repository.create(normalizeTodoDraft(draft))
  }
}
