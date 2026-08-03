import { useMemo, type DragEvent } from 'react'
import type { Todo } from '../../../domain/entities/todo'
import {
  TODO_STATUSES,
  TODO_STATUS_LABELS,
  type TodoStatus,
} from '../../../domain/entities/todo-status'
import { buildTodoTree, flattenTree } from '../../../domain/entities/todo-tree'
import { TODO_TYPE_LABELS } from '../../../domain/entities/todo-type'

interface KanbanViewProps {
  todos: readonly Todo[]
  isSaving: boolean
  onUpdate(todo: Todo): Promise<boolean>
  onOpen(id: number): void
}

export function KanbanView({ todos, isSaving, onUpdate, onOpen }: KanbanViewProps) {
  // 列の中でも木の並び（深さ優先）を保つと、親子が近くに並んで読みやすい。
  const ordered = useMemo(
    () => flattenTree(buildTodoTree(todos)).map((node) => node.todo),
    [todos],
  )
  const byStatus = useMemo(() => {
    const columns: Record<TodoStatus, Todo[]> = { todo: [], doing: [], done: [] }
    for (const todo of ordered) {
      columns[todo.status].push(todo)
    }
    return columns
  }, [ordered])
  const titleById = useMemo(() => new Map(todos.map((todo) => [todo.id, todo.title])), [todos])

  function moveTo(todo: Todo, status: TodoStatus) {
    if (todo.status !== status && !isSaving) {
      void onUpdate({ ...todo, status })
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>, status: TodoStatus) {
    event.preventDefault()
    const id = Number(event.dataTransfer.getData('text/plain'))
    const todo = todos.find((candidate) => candidate.id === id)
    if (todo) {
      moveTo(todo, status)
    }
  }

  return (
    <div className="kanban">
      {TODO_STATUSES.map((status) => (
        <section
          key={status}
          className={`kanban__column kanban__column--${status}`}
          aria-label={TODO_STATUS_LABELS[status]}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => handleDrop(event, status)}
        >
          <header className="kanban__header">
            <h2>{TODO_STATUS_LABELS[status]}</h2>
            <span className="kanban__count">{byStatus[status].length}</span>
          </header>
          <div className="kanban__cards">
            {byStatus[status].length === 0 && (
              <p className="kanban__empty">ここにドロップで {TODO_STATUS_LABELS[status]} へ</p>
            )}
            {byStatus[status].map((todo) => (
              <KanbanCard
                key={todo.id}
                todo={todo}
                parentTitle={todo.parentId === null ? null : titleById.get(todo.parentId) ?? null}
                isSaving={isSaving}
                onMove={(nextStatus) => moveTo(todo, nextStatus)}
                onOpen={() => onOpen(todo.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

interface KanbanCardProps {
  todo: Todo
  parentTitle: string | null
  isSaving: boolean
  onMove(status: TodoStatus): void
  onOpen(): void
}

function KanbanCard({ todo, parentTitle, isSaving, onMove, onOpen }: KanbanCardProps) {
  const statusIndex = TODO_STATUSES.indexOf(todo.status)
  const previousStatus = TODO_STATUSES[statusIndex - 1] ?? null
  const nextStatus = TODO_STATUSES[statusIndex + 1] ?? null

  return (
    <article
      className="kanban-card"
      draggable={!isSaving}
      onDragStart={(event) => event.dataTransfer.setData('text/plain', String(todo.id))}
    >
      <button type="button" className="kanban-card__body" onClick={onOpen} disabled={isSaving}>
        <span className={`todo-item__type todo-item__type--${todo.type}`}>
          {TODO_TYPE_LABELS[todo.type]}
        </span>
        <strong>{todo.title}</strong>
        {parentTitle && <small className="kanban-card__parent">親: {parentTitle}</small>}
        {todo.description && <small>{todo.description}</small>}
      </button>
      <div className="kanban-card__actions">
        <button
          type="button"
          disabled={isSaving || previousStatus === null}
          aria-label={
            previousStatus === null
              ? undefined
              : `${todo.title} を ${TODO_STATUS_LABELS[previousStatus]} へ戻す`
          }
          onClick={() => previousStatus && onMove(previousStatus)}
        >
          ←
        </button>
        <button
          type="button"
          disabled={isSaving || nextStatus === null}
          aria-label={
            nextStatus === null
              ? undefined
              : `${todo.title} を ${TODO_STATUS_LABELS[nextStatus]} へ進める`
          }
          onClick={() => nextStatus && onMove(nextStatus)}
        >
          →
        </button>
      </div>
    </article>
  )
}
