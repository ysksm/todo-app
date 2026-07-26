import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Todo } from '../domain/entities/todo'
import { confirmCascadingDelete } from './confirm-cascading-delete'

function todo(id: number, parentId: number | null, title = `todo-${id}`): Todo {
  return { id, title, description: '', completed: false, parentId, position: 0 }
}

/**
 *   root(1) ─┬─ child(2) ── grandchild(3)
 *            └─ leaf(4)
 *   lonely(5)
 */
const TODOS: readonly Todo[] = [
  todo(1, null, 'root'),
  todo(2, 1, 'child'),
  todo(3, 2, 'grandchild'),
  todo(4, 1, 'leaf'),
  todo(5, null, 'lonely'),
]

function stubConfirm(answer: boolean) {
  return vi.spyOn(window, 'confirm').mockReturnValue(answer)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('confirmCascadingDelete', () => {
  it('does not ask when the todo has no children', () => {
    const confirm = stubConfirm(true)

    expect(confirmCascadingDelete(TODOS, 5)).toBe(true)
    expect(confirmCascadingDelete(TODOS, 3)).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('counts every descendant, not just direct children', () => {
    const confirm = stubConfirm(true)

    confirmCascadingDelete(TODOS, 1)

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('子タスク 3 件'))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('root'))
  })

  it('returns true when the user accepts', () => {
    stubConfirm(true)

    expect(confirmCascadingDelete(TODOS, 1)).toBe(true)
  })

  it('returns false when the user declines', () => {
    stubConfirm(false)

    expect(confirmCascadingDelete(TODOS, 1)).toBe(false)
  })

  it('does not ask for a todo that is not in the list', () => {
    const confirm = stubConfirm(true)

    expect(confirmCascadingDelete(TODOS, 999)).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
  })
})
