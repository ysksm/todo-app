import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppStore } from '@/app/store/create-app-store'
import type { Todo } from '../../../domain/entities/todo'
import { MindmapView } from './mindmap-view'

function todo(id: number, parentId: number | null, position: number, title = `todo-${id}`): Todo {
  return { id, title, description: '', completed: false, parentId, position }
}

/**
 *   root(1) ─┬─ child a(2) ── grandchild(4)
 *            └─ child b(3)
 *   second root(5)
 */
const TODOS: readonly Todo[] = [
  todo(1, null, 0, 'root'),
  todo(2, 1, 0, 'child a'),
  todo(3, 1, 1, 'child b'),
  todo(4, 2, 0, 'grandchild'),
  todo(5, null, 1, 'second root'),
]

function renderMindmap(overrides: Partial<Parameters<typeof MindmapView>[0]> = {}) {
  const props = {
    todos: TODOS,
    isSaving: false,
    onCreate: vi.fn().mockResolvedValue(todo(99, null, 0, 'created')),
    onUpdate: vi.fn().mockResolvedValue(true),
    onMove: vi.fn().mockResolvedValue(true),
    onDelete: vi.fn().mockResolvedValue(true),
    ...overrides,
  }

  render(
    <Provider store={createAppStore()}>
      <MindmapView {...props} />
    </Provider>,
  )

  return { ...props, tree: screen.getByRole('tree') }
}

function focusedTitle(): string | null {
  const activeId = screen.getByRole('tree').getAttribute('aria-activedescendant')
  if (!activeId) {
    return null
  }
  const title = document.getElementById(activeId)?.querySelector('.mindmap-node__title')
  return title?.textContent?.trim() ?? null
}

let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
})

describe('MindmapView rendering', () => {
  it('renders every todo as a tree item with its depth', () => {
    renderMindmap()

    expect(screen.getAllByRole('treeitem')).toHaveLength(TODOS.length)
    expect(screen.getByText('root').closest('[role="treeitem"]')).toHaveAttribute('aria-level', '1')
    expect(screen.getByText('child a').closest('[role="treeitem"]')).toHaveAttribute(
      'aria-level',
      '2',
    )
    expect(screen.getByText('grandchild').closest('[role="treeitem"]')).toHaveAttribute(
      'aria-level',
      '3',
    )
  })

  it('starts with the first root focused', () => {
    renderMindmap()

    expect(focusedTitle()).toBe('root')
  })

  it('shows a hint when there is nothing to draw', () => {
    renderMindmap({ todos: [] })

    expect(screen.queryAllByRole('treeitem')).toHaveLength(0)
    expect(screen.getByText(/最初のタスクを追加/)).toBeInTheDocument()
  })
})

describe('MindmapView keyboard navigation', () => {
  it('moves into a child with ArrowRight and back with ArrowLeft', async () => {
    renderMindmap()

    await user.keyboard('{ArrowRight}')
    expect(focusedTitle()).toBe('child a')

    await user.keyboard('{ArrowRight}')
    expect(focusedTitle()).toBe('grandchild')

    await user.keyboard('{ArrowLeft}')
    expect(focusedTitle()).toBe('child a')

    await user.keyboard('{ArrowLeft}')
    expect(focusedTitle()).toBe('root')
  })

  it('moves between siblings with ArrowDown and ArrowUp', async () => {
    renderMindmap()

    await user.keyboard('{ArrowRight}')
    await user.keyboard('{ArrowDown}')
    expect(focusedTitle()).toBe('child b')

    await user.keyboard('{ArrowUp}')
    expect(focusedTitle()).toBe('child a')
  })

  it('treats roots as siblings of each other', async () => {
    renderMindmap()

    await user.keyboard('{ArrowDown}')
    expect(focusedTitle()).toBe('second root')
  })

  it('stays put at the edges instead of wrapping around', async () => {
    renderMindmap()

    await user.keyboard('{ArrowUp}')
    expect(focusedTitle()).toBe('root')

    await user.keyboard('{ArrowLeft}')
    expect(focusedTitle()).toBe('root')

    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(focusedTitle()).toBe('grandchild')
  })

  it('jumps to the first and last sibling with Home and End', async () => {
    renderMindmap()

    await user.keyboard('{ArrowRight}{End}')
    expect(focusedTitle()).toBe('child b')

    await user.keyboard('{Home}')
    expect(focusedTitle()).toBe('child a')
  })

  it('expands a collapsed node before descending into it', async () => {
    renderMindmap()

    await user.click(screen.getByRole('button', { name: 'root の子タスクを隠す' }))
    expect(screen.queryByText('child a')).not.toBeInTheDocument()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByText('child a')).toBeInTheDocument()
    expect(focusedTitle()).toBe('root')

    await user.keyboard('{ArrowRight}')
    expect(focusedTitle()).toBe('child a')
  })
})

describe('MindmapView focus when a node is hidden', () => {
  function activeDescendantId(): string | null {
    return screen.getByRole('tree').getAttribute('aria-activedescendant')
  }

  it('moves focus to the nearest visible ancestor when it is collapsed away', async () => {
    renderMindmap()

    await user.keyboard('{ArrowRight}{ArrowRight}') // grandchild
    expect(focusedTitle()).toBe('grandchild')

    await user.click(screen.getByRole('button', { name: 'root の子タスクを隠す' }))

    expect(screen.queryByText('grandchild')).not.toBeInTheDocument()
    expect(focusedTitle()).toBe('root')
  })

  it('never points aria-activedescendant at a missing element', async () => {
    renderMindmap()

    await user.keyboard('{ArrowRight}{ArrowRight}') // grandchild
    await user.click(screen.getByRole('button', { name: 'root の子タスクを隠す' }))

    const activeId = activeDescendantId()
    expect(activeId).not.toBeNull()
    expect(document.getElementById(activeId!)).not.toBeNull()
  })

  it('keeps navigating from the visible node after a collapse', async () => {
    renderMindmap()

    await user.keyboard('{ArrowRight}{ArrowRight}') // grandchild
    await user.click(screen.getByRole('button', { name: 'root の子タスクを隠す' }))

    // 隠れた grandchild ではなく、表示中の root を起点に動く
    await user.keyboard('{ArrowDown}')
    expect(focusedTitle()).toBe('second root')
  })

  it('returns to the original node when the parent is expanded again', async () => {
    renderMindmap()

    await user.keyboard('{ArrowRight}{ArrowRight}') // grandchild
    await user.click(screen.getByRole('button', { name: 'root の子タスクを隠す' }))
    await user.click(screen.getByRole('button', { name: 'root の子タスクを表示' }))

    expect(focusedTitle()).toBe('grandchild')
  })
})

describe('MindmapView editing', () => {
  it('opens an input on F2 with the current title selected', async () => {
    renderMindmap()

    await user.keyboard('{F2}')

    const input = screen.getByLabelText('タスク名')
    expect(input).toHaveValue('root')
    expect(input).toHaveFocus()
  })

  it('saves the new title on Enter', async () => {
    const { onUpdate } = renderMindmap()

    await user.keyboard('{F2}')
    await user.keyboard('renamed{Enter}')

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, title: 'renamed' }),
      )
    })
    expect(screen.queryByLabelText('タスク名')).not.toBeInTheDocument()
  })

  it('discards the change on Escape', async () => {
    const { onUpdate } = renderMindmap()

    await user.keyboard('{F2}')
    await user.keyboard('renamed{Escape}')

    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByText('root')).toBeInTheDocument()
  })

  it('does not save when the title is cleared', async () => {
    const { onUpdate } = renderMindmap()

    await user.keyboard('{F2}')
    await user.keyboard('{Enter}')

    expect(onUpdate).not.toHaveBeenCalled()
  })
})

describe('MindmapView adding and removing', () => {
  it('adds a sibling with Enter and keeps it in place', async () => {
    const { onCreate, onMove } = renderMindmap()

    await user.keyboard('{ArrowRight}') // child a
    await user.keyboard('{Enter}')
    await user.keyboard('新しい兄弟{Enter}')

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        title: '新しい兄弟',
        description: '',
        completed: false,
        parentId: 1,
      })
    })
    // child a と child b の間に挿入するので位置を直しにいく
    await waitFor(() => {
      expect(onMove).toHaveBeenCalledWith({ id: 99, parentId: 1, position: 1 })
    })
  })

  it('appends a sibling without an extra move when it goes last', async () => {
    const { onCreate, onMove } = renderMindmap()

    await user.keyboard('{ArrowRight}{End}') // child b
    await user.keyboard('{Enter}')
    await user.keyboard('末尾{Enter}')

    await waitFor(() => expect(onCreate).toHaveBeenCalled())
    expect(onMove).not.toHaveBeenCalled()
  })

  it('adds a child with Tab', async () => {
    const { onCreate } = renderMindmap()

    await user.keyboard('{ArrowRight}{ArrowDown}') // child b
    await user.keyboard('{Tab}')
    await user.keyboard('子タスク{Enter}')

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ parentId: 3 }))
    })
  })

  it('creates the first root with Enter when the map is empty', async () => {
    const { onCreate } = renderMindmap({ todos: [] })

    await user.keyboard('{Enter}')
    await user.keyboard('最初のタスク{Enter}')

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ title: '最初のタスク', parentId: null }),
      )
    })
  })

  it('discards an empty draft', async () => {
    const { onCreate } = renderMindmap()

    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('タスク名')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('タスク名')).not.toBeInTheDocument()
  })

  // 子孫ごと削除する確認は useTodos.remove がまとめて行う（use-todos.test.ts を参照）。
  it('deletes the focused node', async () => {
    const { onDelete } = renderMindmap()

    await user.keyboard('{ArrowRight}{ArrowDown}') // child b
    await user.keyboard('{Delete}')

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(3))
  })

  it('moves focus to a neighbour after deleting', async () => {
    renderMindmap()

    await user.keyboard('{ArrowRight}{ArrowDown}') // child b
    await user.keyboard('{Delete}')

    await waitFor(() => expect(focusedTitle()).toBe('child a'))
  })

  it('keeps the focus when the deletion is refused', async () => {
    renderMindmap({ onDelete: vi.fn().mockResolvedValue(false) })

    await user.keyboard('{ArrowRight}{ArrowDown}') // child b
    await user.keyboard('{Delete}')

    await waitFor(() => expect(focusedTitle()).toBe('child b'))
  })

  it('toggles completion with Space', async () => {
    const { onUpdate } = renderMindmap()

    await user.keyboard('[Space]')

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 1, completed: true }))
    })
  })
})

describe('MindmapView help', () => {
  it('toggles the shortcut list with ?', async () => {
    renderMindmap()

    expect(screen.queryByRole('complementary', { name: 'キー操作の一覧' })).not.toBeInTheDocument()

    await user.keyboard('?')
    expect(screen.getByRole('complementary', { name: 'キー操作の一覧' })).toBeInTheDocument()

    await user.keyboard('?')
    expect(screen.queryByRole('complementary', { name: 'キー操作の一覧' })).not.toBeInTheDocument()
  })
})
