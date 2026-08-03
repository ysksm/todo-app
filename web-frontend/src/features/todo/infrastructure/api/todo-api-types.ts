import type { TodoStatus } from '../../domain/entities/todo-status'
import type { TodoType } from '../../domain/entities/todo-type'

export interface TodoResponse {
  id: number
  title: string
  description: string
  status: TodoStatus
  type: TodoType
  parent_id: number | null
  position: number
}
