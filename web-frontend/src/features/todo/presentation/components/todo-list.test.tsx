import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Todo } from '../../domain/entities/todo'
import type { TodoFilter } from '../../domain/entities/todo-filter'
import type { TodoStatus } from '../../domain/entities/todo-status'
import type { TodoType } from '../../domain/entities/todo-type'
import { TodoList } from './todo-list'

function todo(
  id: number,
  status: TodoStatus,
  parentId: number | null = null,
  type: TodoType = 'task',
  title = `todo-${id}`,
  description = '',
): Todo {
  return { id, title, description, status, type, parentId, position: id }
}

const NO_FILTER: TodoFilter = { status: null, type: null, query: '' }

function renderList(todos: readonly Todo[], filter: Partial<TodoFilter> = {}) {
  render(
    <TodoList
      todos={todos}
      filter={{ ...NO_FILTER, ...filter }}
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
    renderList(TODOS)

    expect(screen.getByText('todo-1')).toBeInTheDocument()
    expect(screen.getByText('todo-2')).toBeInTheDocument()
    expect(screen.getByText('todo-3')).toBeInTheDocument()
  })

  it('shows only todos in the selected status', () => {
    renderList(TODOS, { status: 'doing' })

    expect(screen.queryByText('todo-1')).not.toBeInTheDocument()
    expect(screen.getByText('todo-2')).toBeInTheDocument()
    expect(screen.queryByText('todo-3')).not.toBeInTheDocument()
  })

  it('keeps the depth of a child whose parent is filtered out', () => {
    renderList([todo(1, 'todo'), todo(2, 'doing', 1)], { status: 'doing' })

    expect(screen.getByText('todo-2').closest('li')).toHaveAttribute('data-depth', '1')
  })

  it('tells filtered-empty apart from no todos at all', () => {
    renderList(TODOS, { status: 'todo' })
    renderList([])

    expect(screen.getByText('登録されている Todo はありません。')).toBeInTheDocument()
  })

  it('shows a dedicated message when the filter matches nothing', () => {
    renderList([todo(1, 'todo')], { status: 'done' })

    expect(screen.getByText('条件に合う Todo はありません。')).toBeInTheDocument()
  })
})

describe('TodoList type filter', () => {
  it('shows only todos of the selected type', () => {
    renderList([todo(1, 'todo', null, 'epic'), todo(2, 'todo', null, 'bug')], { type: 'bug' })

    expect(screen.queryByText('todo-1')).not.toBeInTheDocument()
    expect(screen.getByText('todo-2')).toBeInTheDocument()
  })
})

describe('TodoList text search', () => {
  const SEARCH_TODOS: readonly Todo[] = [
    todo(1, 'todo', null, 'task', '牛乳を買う'),
    todo(2, 'todo', null, 'task', '掃除', '牛乳をこぼした床'),
    todo(3, 'todo', null, 'task', 'Fix login bug'),
  ]

  it('matches against the title', () => {
    renderList(SEARCH_TODOS, { query: '牛乳を買う' })

    expect(screen.getByText('牛乳を買う')).toBeInTheDocument()
    expect(screen.queryByText('掃除')).not.toBeInTheDocument()
  })

  it('matches against the description too', () => {
    renderList(SEARCH_TODOS, { query: '牛乳' })

    expect(screen.getByText('牛乳を買う')).toBeInTheDocument()
    expect(screen.getByText('掃除')).toBeInTheDocument()
    expect(screen.queryByText('Fix login bug')).not.toBeInTheDocument()
  })

  it('ignores case and surrounding spaces', () => {
    renderList(SEARCH_TODOS, { query: '  LOGIN ' })

    expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    expect(screen.queryByText('牛乳を買う')).not.toBeInTheDocument()
  })
})

describe('TodoList combined filters', () => {
  it('applies status, type and query together', () => {
    const todos = [
      todo(1, 'doing', null, 'bug', 'ログインできない'),
      todo(2, 'doing', null, 'bug', '画面が崩れる'),
      todo(3, 'done', null, 'bug', 'ログイン後に落ちる'),
      todo(4, 'doing', null, 'task', 'ログイン画面を作る'),
    ]

    renderList(todos, { status: 'doing', type: 'bug', query: 'ログイン' })

    expect(screen.getByText('ログインできない')).toBeInTheDocument()
    expect(screen.queryByText('画面が崩れる')).not.toBeInTheDocument()
    expect(screen.queryByText('ログイン後に落ちる')).not.toBeInTheDocument()
    expect(screen.queryByText('ログイン画面を作る')).not.toBeInTheDocument()
  })
})
