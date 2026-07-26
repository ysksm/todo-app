import { useMemo } from 'react'
import type { Todo } from '../../domain/entities/todo'
import { buildTodoTree, flattenTree } from '../../domain/entities/todo-tree'
import { TodoListItem } from './todo-list-item'

interface TodoListProps {
  todos: readonly Todo[]
  isSaving: boolean
  onUpdate(todo: Todo): Promise<boolean>
  onDelete(id: number): Promise<boolean>
  onOpen(id: number): void
}

export function TodoList({ todos, isSaving, onUpdate, onDelete, onOpen }: TodoListProps) {
  const nodes = useMemo(() => flattenTree(buildTodoTree(todos)), [todos])

  if (nodes.length === 0) {
    return <p className="todo-empty">登録されている Todo はありません。</p>
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
