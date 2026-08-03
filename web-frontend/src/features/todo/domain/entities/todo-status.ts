/** タスクの進行状態。ToDo → Doing → Done と進む。 */
export const TODO_STATUSES = ['todo', 'doing', 'done'] as const

export type TodoStatus = (typeof TODO_STATUSES)[number]

export const TODO_STATUS_LABELS: Record<TodoStatus, string> = {
  todo: 'ToDo',
  doing: 'Doing',
  done: 'Done',
}

/** ワンクリック操作用。ToDo → Doing → Done → ToDo と巡回する。 */
export function nextStatus(status: TodoStatus): TodoStatus {
  const index = TODO_STATUSES.indexOf(status)
  return TODO_STATUSES[(index + 1) % TODO_STATUSES.length]
}
