import type { HttpClient } from '@/shared/infrastructure/http/http-client'
import type { Todo, TodoDraft, TodoUpdate } from '../../domain/entities/todo'
import type { TodoRepository } from '../../domain/repositories/todo-repository'
import type { TodoResponse } from '../api/todo-api-types'

export class HttpTodoRepository implements TodoRepository {
  private readonly httpClient: HttpClient

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient
  }

  async list(): Promise<readonly Todo[]> {
    const todos = await this.httpClient.request<TodoResponse[]>('/api/todos')
    return todos.map(toTodo)
  }

  async create(draft: TodoDraft): Promise<Todo> {
    const todo = await this.httpClient.request<TodoResponse>('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    return toTodo(todo)
  }

  async update(todo: TodoUpdate): Promise<Todo> {
    const updatedTodo = await this.httpClient.request<TodoResponse>(`/api/todos/${todo.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: todo.title,
        description: todo.description,
        completed: todo.completed,
      }),
    })
    return toTodo(updatedTodo)
  }

  async delete(id: number): Promise<void> {
    await this.httpClient.request<void>(`/api/todos/${id}`, { method: 'DELETE' })
  }
}

function toTodo(response: TodoResponse): Todo {
  return {
    id: response.id,
    title: response.title,
    description: response.description,
    completed: response.completed,
  }
}
