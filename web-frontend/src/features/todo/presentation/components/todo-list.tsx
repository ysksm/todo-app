import { useMemo } from 'react'
import type { Todo } from '../../domain/entities/todo'
import type { TodoStatus } from '../../domain/entities/todo-status'
import { buildTodoTree, flattenTree } from '../../domain/entities/todo-tree'
import { TodoListItem } from './todo-list-item'

interface TodoListProps {
  todos: readonly Todo[]
  /** null なら全状態を表示する。 */
  statusFilter: TodoStatus | null
  isSaving: boolean
  onUpdate(todo: Todo): Promise<boolean>
  onDelete(id: number): Promise<boolean>
  onOpen(id: number): void
}

export function TodoList({
  todos,
  statusFilter,
  isSaving,
  onUpdate,
  onDelete,
  onOpen,
}: TodoListProps) {
  // 木の形（深さ）は全件で組み立ててから絞る。親が絞られても子の深さは変えない。
  const nodes = useMemo(() => {
    const flattened = flattenTree(buildTodoTree(todos))
    return statusFilter === null
      ? flattened
      : flattened.filter((node) => node.todo.status === statusFilter)
  }, [todos, statusFilter])

  if (nodes.length === 0) {
    return (
      <p className="todo-empty">
        {todos.length === 0
          ? '登録されている Todo はありません。'
          : 'この状態の Todo はありません。'}
      </p>
    )
  }

  return (
    <ul className="todo-list">
      {nodes.map((node) => (
        <TodoListItem
          key={node.todo.id}
          todo={node.todo}
          depth={node.depth}
          isSaving={isSaving}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onOpen={onOpen}
        />
      ))}
    </ul>
  )
}
