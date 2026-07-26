export interface TodoResponse {
  id: number
  title: string
  description: string
  completed: boolean
  parent_id: number | null
  position: number
}
