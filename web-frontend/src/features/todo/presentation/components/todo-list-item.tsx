import type { CSSProperties } from 'react'
import type { Todo } from '../../domain/entities/todo'
import {
  TODO_STATUSES,
  TODO_STATUS_LABELS,
  type TodoStatus,
} from '../../domain/entities/todo-status'
import { TODO_TYPE_LABELS } from '../../domain/entities/todo-type'

interface TodoListItemProps {
  todo: Todo
  depth: number
  isSaving: boolean
  onUpdate(todo: Todo): Promise<boolean>
  onDelete(id: number): Promise<boolean>
  onOpen(id: number): void
}

export function TodoListItem({
  todo,
  depth,
  isSaving,
  onUpdate,
  onDelete,
  onOpen,
}: TodoListItemProps) {
  return (
    <li
      className={`todo-item todo-item--${todo.status}`}
      style={{ '--todo-depth': depth } as CSSProperties}
      data-depth={depth}
    >
      <div className="todo-item__summary">
        <select
          className={`todo-item__status todo-item__status--${todo.status}`}
          value={todo.status}
          disabled={isSaving}
          aria-label={`${todo.title} の状態`}
          onChange={(event) =>
            void onUpdate({ ...todo, status: event.target.value as TodoStatus })
          }
        >
          {TODO_STATUSES.map((status) => (
            <option key={status} value={status}>
              {TODO_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => onOpen(todo.id)} disabled={isSaving}>
          <span className={`todo-item__type todo-item__type--${todo.type}`}>
            {TODO_TYPE_LABELS[todo.type]}
          </span>
          <strong>{todo.title}</strong>
          {todo.description && <small>{todo.description}</small>}
        </button>
      </div>
      <div className="todo-item__actions">
        <button type="button" onClick={() => void onDelete(todo.id)} disabled={isSaving}>削除</button>
      </div>
    </li>
  )
}
