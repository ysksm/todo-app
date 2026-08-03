import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppStore } from '@/app/store/create-app-store'
import type { TodoDependencies } from '../../di/todo-dependencies'
import type { Todo } from '../../domain/entities/todo'
import { useTodos } from './use-todos'

function todo(id: number, parentId: number | null, title = `todo-${id}`): Todo {
  return { id, title, description: '', status: 'todo', type: 'task', parentId, position: 0 }
}

/** root(1) ─ child(2) ── grandchild(3) / lonely(4) */
const TODOS: readonly Todo[] = [
  todo(1, null, 'root'),
  todo(2, 1, 'child'),
  todo(3, 2, 'grandchild'),
  todo(4, null, 'lonely'),
]

function createDependencies(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    listTodos: { execute: vi.fn().mockResolvedValue(TODOS) },
    createTodo: { execute: vi.fn().mockResolvedValue(todo(9, null)) },
    updateTodo: { execute: vi.fn().mockResolvedValue(todo(1, null)) },
    moveTodo: { execute: vi.fn().mockResolvedValue(todo(1, null)) },
    deleteTodo: { execute: vi.fn().mockResolvedValue(undefined) },
    subscribeToChanges: vi.fn().mockReturnValue(vi.fn()),
    ...overrides,
  } as unknown as TodoDependencies
}

function wrapper({ children }: { children: ReactNode }) {
  return <Provider store={createAppStore()}>{children}</Provider>
}

async function renderUseTodos(dependencies: TodoDependencies) {
  const rendered = renderHook(() => useTodos(dependencies), { wrapper })
  await waitFor(() => expect(rendered.result.current.todos).toHaveLength(TODOS.length))
  return rendered
}

function stubConfirm(answer: boolean) {
  return vi.spyOn(window, 'confirm').mockReturnValue(answer)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTodos remove', () => {
  it('asks before deleting a todo that has descendants', async () => {
    const confirm = stubConfirm(true)
    const dependencies = createDependencies()
    const { result } = await renderUseTodos(dependencies)

    await result.current.remove(1)

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('子タスク 2 件'))
    expect(dependencies.deleteTodo.execute).toHaveBeenCalledWith(1)
  })

  it('does not call the API when the confirmation is declined', async () => {
    stubConfirm(false)
    const dependencies = createDependencies()
    const { result } = await renderUseTodos(dependencies)

    await expect(result.current.remove(1)).resolves.toBe(false)

    expect(dependencies.deleteTodo.execute).not.toHaveBeenCalled()
  })

  it('deletes a leaf without asking', async () => {
    const confirm = stubConfirm(true)
    const dependencies = createDependencies()
    const { result } = await renderUseTodos(dependencies)

    await expect(result.current.remove(4)).resolves.toBe(true)

    expect(confirm).not.toHaveBeenCalled()
    expect(dependencies.deleteTodo.execute).toHaveBeenCalledWith(4)
  })

  it('reports a failure without throwing', async () => {
    stubConfirm(true)
    const dependencies = createDependencies({
      deleteTodo: { execute: vi.fn().mockRejectedValue(new Error('boom')) },
    })
    const { result } = await renderUseTodos(dependencies)

    await expect(result.current.remove(4)).resolves.toBe(false)
    await waitFor(() => expect(result.current.error).not.toBeNull())
  })
})

describe('useTodos change notifications', () => {
  function listCalls(dependencies: TodoDependencies): number {
    return (dependencies.listTodos.execute as ReturnType<typeof vi.fn>).mock.calls.length
  }

  it('refetches the list when a server-side change arrives', async () => {
    let notify: () => void = () => {}
    const dependencies = createDependencies({
      subscribeToChanges: vi.fn((onChange: () => void) => {
        notify = onChange
        return vi.fn()
      }),
    })
    const { result } = await renderUseTodos(dependencies)
    const callsBefore = listCalls(dependencies)

    act(() => notify())

    await waitFor(() => expect(listCalls(dependencies)).toBeGreaterThan(callsBefore))
    // 静かな再取得なのでローディング表示は出ない。
    expect(result.current.isLoading).toBe(false)
  })

  it('unsubscribes on unmount', async () => {
    const unsubscribe = vi.fn()
    const dependencies = createDependencies({
      subscribeToChanges: vi.fn().mockReturnValue(unsubscribe),
    })
    const { unmount } = await renderUseTodos(dependencies)

    unmount()

    expect(unsubscribe).toHaveBeenCalled()
  })
})

describe('useTodos mutations', () => {
  it('creates a root todo from a title', async () => {
    const dependencies = createDependencies()
    const { result } = await renderUseTodos(dependencies)

    await expect(result.current.create('新しいタスク', 'product')).resolves.toBe(true)

    expect(dependencies.createTodo.execute).toHaveBeenCalledWith({
      title: '新しいタスク',
      description: '',
      status: 'todo',
      type: 'product',
      parentId: null,
    })
  })

  it('returns the created todo from createTodo', async () => {
    const created = todo(9, 1, '子')
    const dependencies = createDependencies({
      createTodo: { execute: vi.fn().mockResolvedValue(created) },
    })
    const { result } = await renderUseTodos(dependencies)

    await expect(
      result.current.createTodo({
        title: '子',
        description: '',
        status: 'todo',
        type: 'epic',
        parentId: 1,
      }),
    ).resolves.toEqual(created)
  })

  it('reloads the list after a move', async () => {
    const dependencies = createDependencies()
    const { result } = await renderUseTodos(dependencies)
    const callsBefore = (dependencies.listTodos.execute as ReturnType<typeof vi.fn>).mock.calls
      .length

    await expect(result.current.move({ id: 2, parentId: null, position: 0 })).resolves.toBe(true)

    expect(dependencies.moveTodo.execute).toHaveBeenCalledWith({
      id: 2,
      parentId: null,
      position: 0,
    })
    expect(
      (dependencies.listTodos.execute as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(callsBefore)
  })
})
