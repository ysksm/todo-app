import { describe, expect, it } from 'vitest'
import type { Todo } from '../../domain/entities/todo'
import { buildTodoTree } from '../../domain/entities/todo-tree'
import { H_GAP, NODE_HEIGHT, NODE_WIDTH, V_GAP, layoutMindmap } from './use-mindmap-layout'

function todo(id: number, parentId: number | null, position: number): Todo {
  return { id, title: `todo-${id}`, description: '', status: 'todo', type: 'task', parentId, position }
}

function layoutOf(todos: readonly Todo[], collapsedIds: number[] = []) {
  return layoutMindmap(buildTodoTree(todos), new Set(collapsedIds))
}

describe('layoutMindmap', () => {
  it('places a single node and sizes the canvas around it', () => {
    const layout = layoutOf([todo(1, null, 0)])

    expect(layout.positions.get(1)).toEqual({ x: 24, y: 24 })
    expect(layout.edges).toEqual([])
    expect(layout.width).toBe(24 * 2 + NODE_WIDTH)
    expect(layout.height).toBeGreaterThanOrEqual(NODE_HEIGHT)
  })

  it('puts each depth in its own column', () => {
    const layout = layoutOf([todo(1, null, 0), todo(2, 1, 0), todo(3, 2, 0)])

    expect(layout.positions.get(1)?.x).toBe(24)
    expect(layout.positions.get(2)?.x).toBe(24 + NODE_WIDTH + H_GAP)
    expect(layout.positions.get(3)?.x).toBe(24 + 2 * (NODE_WIDTH + H_GAP))
  })

  it('stacks leaves vertically and centres the parent between them', () => {
    const layout = layoutOf([todo(1, null, 0), todo(2, 1, 0), todo(3, 1, 1)])

    const first = layout.positions.get(2)!
    const second = layout.positions.get(3)!
    const parent = layout.positions.get(1)!

    expect(second.y - first.y).toBe(NODE_HEIGHT + V_GAP)
    expect(parent.y).toBe((first.y + second.y) / 2)
  })

  it('keeps a chain of single children on one row', () => {
    const layout = layoutOf([todo(1, null, 0), todo(2, 1, 0), todo(3, 2, 0)])

    expect(layout.positions.get(1)?.y).toBe(layout.positions.get(3)?.y)
  })

  it('does not overlap the subtrees of separate roots', () => {
    const layout = layoutOf([
      todo(1, null, 0),
      todo(2, 1, 0),
      todo(3, 1, 1),
      todo(4, null, 1),
    ])

    const lastChildOfFirstRoot = layout.positions.get(3)!
    const secondRoot = layout.positions.get(4)!

    expect(secondRoot.y).toBeGreaterThanOrEqual(lastChildOfFirstRoot.y + NODE_HEIGHT)
  })

  it('hides the children of a collapsed node', () => {
    const layout = layoutOf([todo(1, null, 0), todo(2, 1, 0), todo(3, 1, 1)], [1])

    expect(layout.visibleNodes.map((node) => node.todo.id)).toEqual([1])
    expect(layout.positions.has(2)).toBe(false)
    expect(layout.edges).toEqual([])
    expect(layout.positions.get(1)).toEqual({ x: 24, y: 24 })
  })

  it('emits one edge per visible parent-child pair', () => {
    const layout = layoutOf([todo(1, null, 0), todo(2, 1, 0), todo(3, 2, 0)])

    expect(layout.edges.map((edge) => [edge.parentId, edge.childId])).toEqual([
      [2, 3],
      [1, 2],
    ])
    expect(layout.edges[0].path.startsWith('M ')).toBe(true)
  })

  it('lists visible nodes parent first, depth first', () => {
    const layout = layoutOf([todo(1, null, 0), todo(2, 1, 0), todo(3, 2, 0), todo(4, 1, 1)])

    expect(layout.visibleNodes.map((node) => node.todo.id)).toEqual([1, 2, 3, 4])
  })

  it('returns an empty layout for an empty forest', () => {
    const layout = layoutOf([])

    expect(layout.visibleNodes).toEqual([])
    expect(layout.positions.size).toBe(0)
  })
})
