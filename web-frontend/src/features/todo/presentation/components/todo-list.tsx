import { useMemo } from 'react'
import type { Todo } from '../../domain/entities/todo'
import { matchesFilter, type TodoFilter } from '../../domain/entities/todo-filter'
import { buildTodoTree, flattenTree } from '../../domain/entities/todo-tree'
import { TodoListItem } from './todo-list-item'

interface TodoListProps {
  todos: readonly Todo[]
  filter: TodoFilter
  isSaving: boolean
  onUpdate(todo: Todo): Promise<boolean>
  onDelete(id: number): Promise<boolean>
  onOpen(id: number): void
}

export function TodoList({ todos, filter, isSaving, onUpdate, onDelete, onOpen }: TodoListProps) {
  // 木の形（深さ）は全件で組み立ててから絞る。親が絞られても子の深さは変えない。
  const nodes = useMemo(() => {
    const flattened = flattenTree(buildTodoTree(todos))
    return flattened.filter((node) => matchesFilter(node.todo, filter))
  }, [todos, filter])

  if (nodes.length === 0) {
    return (
      <p className="todo-empty">
        {todos.length === 0
          ? '登録されている Todo はありません。'
          : '条件に合う Todo はありません。'}
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
