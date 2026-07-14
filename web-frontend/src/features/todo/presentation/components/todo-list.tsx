import type { Todo } from '../../domain/entities/todo'
import { TodoListItem } from './todo-list-item'

interface TodoListProps {
  todos: readonly Todo[]
  isSaving: boolean
  onUpdate(todo: Todo): Promise<boolean>
  onDelete(id: number): Promise<boolean>
  onOpen(id: number): void
}

export function TodoList({ todos, isSaving, onUpdate, onDelete, onOpen }: TodoListProps) {
  if (todos.length === 0) {
    return <p className="todo-empty">登録されている Todo はありません。</p>
  }

  return (
    <ul className="todo-list">
      {todos.map((todo) => (
        <TodoListItem
          key={todo.id}
          todo={todo}
          isSaving={isSaving}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onOpen={onOpen}
        />
      ))}
    </ul>
  )
}
