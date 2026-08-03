import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Todo } from '../../domain/entities/todo'
import type { TodoStatus } from '../../domain/entities/todo-status'
import { TodoList } from './todo-list'

function todo(id: number, status: TodoStatus, parentId: number | null = null): Todo {
  return { id, title: `todo-${id}`, description: '', status, type: 'task', parentId, position: id }
}

function renderList(todos: readonly Todo[], statusFilter: TodoStatus | null) {
  render(
    <TodoList
      todos={todos}
      statusFilter={statusFilter}
      isSaving={false}
      onUpdate={vi.fn().mockResolvedValue(true)}
      onDelete={vi.fn().mockResolvedValue(true)}
      onOpen={vi.fn()}
    />,
  )
}

const TODOS: readonly Todo[] = [todo(1, 'todo'), todo(2, 'doing'), todo(3, 'done')]

describe('TodoList status filter', () => {
  it('shows every todo without a filter', () => {
    renderList(TODOS, null)

    expect(screen.getByText('todo-1')).toBeInTheDocument()
    expect(screen.getByText('todo-2')).toBeInTheDocument()
    expect(screen.getByText('todo-3')).toBeInTheDocument()
  })

  it('shows only todos in the selected status', () => {
    renderList(TODOS, 'doing')

    expect(screen.queryByText('todo-1')).not.toBeInTheDocument()
    expect(screen.getByText('todo-2')).toBeInTheDocument()
    expect(screen.queryByText('todo-3')).not.toBeInTheDocument()
  })

  it('keeps the depth of a child whose parent is filtered out', () => {
    renderList([todo(1, 'todo'), todo(2, 'doing', 1)], 'doing')

    expect(screen.getByText('todo-2').closest('li')).toHaveAttribute('data-depth', '1')
  })

  it('tells filtered-empty apart from no todos at all', () => {
    renderList(TODOS, 'todo')
    renderList([], null)

    expect(screen.getByText('登録されている Todo はありません。')).toBeInTheDocument()
  })

  it('shows a dedicated message when the filter matches nothing', () => {
    renderList([todo(1, 'todo')], 'done')

    expect(screen.getByText('この状態の Todo はありません。')).toBeInTheDocument()
  })
})
