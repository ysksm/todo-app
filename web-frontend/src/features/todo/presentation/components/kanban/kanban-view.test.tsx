import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Todo } from '../../../domain/entities/todo'
import type { TodoStatus } from '../../../domain/entities/todo-status'
import { KanbanView } from './kanban-view'

function todo(id: number, status: TodoStatus, title = `todo-${id}`): Todo {
  return { id, title, description: '', status, type: 'task', parentId: null, position: id }
}

const TODOS: readonly Todo[] = [
  todo(1, 'todo', '手つかず'),
  todo(2, 'doing', '作業中'),
  todo(3, 'done', '完了済み'),
]

function renderKanban(overrides: Partial<Parameters<typeof KanbanView>[0]> = {}) {
  const props = {
    todos: TODOS,
    filter: { status: null, type: null, query: '' },
    isSaving: false,
    onUpdate: vi.fn().mockResolvedValue(true),
    onOpen: vi.fn(),
    ...overrides,
  }
  render(<KanbanView {...props} />)
  return props
}

function column(name: string) {
  return within(screen.getByRole('region', { name }))
}

describe('KanbanView', () => {
  it('groups todos into columns by status', () => {
    renderKanban()

    expect(column('ToDo').getByText('手つかず')).toBeInTheDocument()
    expect(column('Doing').getByText('作業中')).toBeInTheDocument()
    expect(column('Done').getByText('完了済み')).toBeInTheDocument()
  })

  it('shows the number of todos per column', () => {
    renderKanban({ todos: [todo(1, 'todo'), todo(2, 'todo'), todo(3, 'done')] })

    expect(column('ToDo').getByText('2')).toBeInTheDocument()
    expect(column('Doing').getByText('0')).toBeInTheDocument()
    expect(column('Done').getByText('1')).toBeInTheDocument()
  })

  it('opens the dialog when a card is clicked', async () => {
    const user = userEvent.setup()
    const { onOpen } = renderKanban()

    await user.click(column('Doing').getByText('作業中'))

    expect(onOpen).toHaveBeenCalledWith(2)
  })

  it('advances the status with the forward button', async () => {
    const user = userEvent.setup()
    const { onUpdate } = renderKanban()

    await user.click(screen.getByRole('button', { name: '手つかず を Doing へ進める' }))

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 1, status: 'doing' }))
  })

  it('moves the status back with the backward button', async () => {
    const user = userEvent.setup()
    const { onUpdate } = renderKanban()

    await user.click(screen.getByRole('button', { name: '完了済み を Doing へ戻す' }))

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 3, status: 'doing' }))
  })

  it('cannot move beyond the first and last status', () => {
    renderKanban()

    const todoCard = column('ToDo').getByText('手つかず').closest('article')!
    const doneCard = column('Done').getByText('完了済み').closest('article')!

    expect(within(todoCard).getByText('←')).toBeDisabled()
    expect(within(doneCard).getByText('→')).toBeDisabled()
  })

  it('updates the status when a card is dropped on another column', () => {
    const { onUpdate } = renderKanban()

    const card = column('ToDo').getByText('手つかず').closest('article')!
    const dataTransfer = {
      data: new Map<string, string>(),
      setData(type: string, value: string) {
        this.data.set(type, value)
      },
      getData(type: string) {
        return this.data.get(type) ?? ''
      },
    }

    fireEvent.dragStart(card, { dataTransfer })
    fireEvent.drop(screen.getByRole('region', { name: 'Doing' }), { dataTransfer })

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 1, status: 'doing' }))
  })

  it('hides cards that do not match the text search', () => {
    renderKanban({ filter: { status: null, type: null, query: '作業' } })

    expect(column('Doing').getByText('作業中')).toBeInTheDocument()
    expect(screen.queryByText('手つかず')).not.toBeInTheDocument()
    expect(screen.queryByText('完了済み')).not.toBeInTheDocument()
  })

  it('hides cards that do not match the type filter', () => {
    const bug: Todo = { ...todo(4, 'doing', 'バグ修正'), type: 'bug' }
    renderKanban({
      todos: [...TODOS, bug],
      filter: { status: null, type: 'bug', query: '' },
    })

    expect(column('Doing').getByText('バグ修正')).toBeInTheDocument()
    expect(screen.queryByText('作業中')).not.toBeInTheDocument()
  })

  it('does not update when a card is dropped on its own column', () => {
    const { onUpdate } = renderKanban()

    const card = column('ToDo').getByText('手つかず').closest('article')!
    const dataTransfer = {
      data: new Map<string, string>(),
      setData(type: string, value: string) {
        this.data.set(type, value)
      },
      getData(type: string) {
        return this.data.get(type) ?? ''
      },
    }

    fireEvent.dragStart(card, { dataTransfer })
    fireEvent.drop(screen.getByRole('region', { name: 'ToDo' }), { dataTransfer })

    expect(onUpdate).not.toHaveBeenCalled()
  })
})
