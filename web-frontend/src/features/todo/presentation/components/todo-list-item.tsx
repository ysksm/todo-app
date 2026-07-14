import type { Todo } from '../../domain/entities/todo'

interface TodoListItemProps {
  todo: Todo
  isSaving: boolean
  onUpdate(todo: Todo): Promise<boolean>
  onDelete(id: number): Promise<boolean>
  onOpen(id: number): void
}

export function TodoListItem({ todo, isSaving, onUpdate, onDelete, onOpen }: TodoListItemProps) {
  return (
    <li className={`todo-item${todo.completed ? ' todo-item--completed' : ''}`}>
      <label className="todo-item__summary">
        <input
          type="checkbox"
          checked={todo.completed}
          disabled={isSaving}
          onChange={() => void onUpdate({ ...todo, completed: !todo.completed })}
        />
        <button type="button" onClick={() => onOpen(todo.id)} disabled={isSaving}>
          <strong>{todo.title}</strong>
          {todo.description && <small>{todo.description}</small>}
        </button>
      </label>
      <div className="todo-item__actions">
        <button type="button" onClick={() => void onDelete(todo.id)} disabled={isSaving}>削除</button>
      </div>
    </li>
  )
}
