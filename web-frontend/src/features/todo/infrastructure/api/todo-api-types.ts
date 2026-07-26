import type { TodoType } from '../../domain/entities/todo-type'

export interface TodoResponse {
  id: number
  title: string
  description: string
  completed: boolean
  type: TodoType
  parent_id: number | null
  position: number
}
