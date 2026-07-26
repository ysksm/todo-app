import { describe, expect, it } from 'vitest'
import type { Todo } from './todo'
import {
  buildTodoTree,
  countDescendants,
  findFirstChild,
  findLastSibling,
  findNode,
  findParent,
  findSibling,
  findSiblings,
  flattenTree,
} from './todo-tree'

function todo(id: number, parentId: number | null, position: number, title = `todo-${id}`): Todo {
  return { id, title, description: '', completed: false, parentId, position }
}

const sampleTodos: readonly Todo[] = [
  todo(1, null, 0, 'root'),
  todo(2, 1, 0, 'child a'),
  todo(3, 1, 1, 'child b'),
  todo(4, 2, 0, 'grandchild'),
  todo(5, null, 1, 'second root'),
]

function titlesOf(nodes: readonly { todo: Todo }[]): string[] {
  return nodes.map((node) => node.todo.title)
}

describe('buildTodoTree', () => {
  it('nests children under their parent and keeps position order', () => {
    const roots = buildTodoTree(sampleTodos)

    expect(titlesOf(roots)).toEqual(['root', 'second root'])
    expect(titlesOf(roots[0].children)).toEqual(['child a', 'child b'])
    expect(titlesOf(roots[0].children[0].children)).toEqual(['grandchild'])
  })

  it('assigns a depth to every node', () => {
    const roots = buildTodoTree(sampleTodos)

    expect(roots[0].depth).toBe(0)
    expect(roots[0].children[0].depth).toBe(1)
    expect(roots[0].children[0].children[0].depth).toBe(2)
  })

  it('orders siblings by position regardless of input order', () => {
    const roots = buildTodoTree([todo(2, null, 1, 'later'), todo(1, null, 0, 'earlier')])

    expect(titlesOf(roots)).toEqual(['earlier', 'later'])
  })

  it('treats a todo whose parent is missing as a root', () => {
    const roots = buildTodoTree([todo(1, null, 0, 'root'), todo(2, 404, 0, 'orphan')])

    expect(titlesOf(roots)).toEqual(['root', 'orphan'])
  })

  it('treats a self-referencing todo as a root', () => {
    const roots = buildTodoTree([todo(1, 1, 0, 'self')])

    expect(titlesOf(roots)).toEqual(['self'])
    expect(roots[0].children).toHaveLength(0)
  })

  it('recovers todos that are unreachable because of a cycle', () => {
    const roots = buildTodoTree([todo(1, 2, 0, 'a'), todo(2, 1, 0, 'b')])

    expect(flattenTree(roots)).toHaveLength(2)
  })

  it('returns an empty forest for an empty list', () => {
    expect(buildTodoTree([])).toEqual([])
  })
})

describe('flattenTree', () => {
  it('walks the tree depth first', () => {
    expect(titlesOf(flattenTree(buildTodoTree(sampleTodos)))).toEqual([
      'root',
      'child a',
      'grandchild',
      'child b',
      'second root',
    ])
  })
})

describe('countDescendants', () => {
  it('counts every level below the node', () => {
    expect(countDescendants(sampleTodos, 1)).toBe(3)
    expect(countDescendants(sampleTodos, 2)).toBe(1)
  })

  it('returns 0 for a leaf and for an unknown id', () => {
    expect(countDescendants(sampleTodos, 4)).toBe(0)
    expect(countDescendants(sampleTodos, 999)).toBe(0)
  })

  it('does not loop forever on a cycle', () => {
    expect(countDescendants([todo(1, 2, 0), todo(2, 1, 0)], 1)).toBe(1)
  })

  it('ignores a self-referencing parent', () => {
    expect(countDescendants([todo(1, 1, 0)], 1)).toBe(0)
  })
})

describe('navigation helpers', () => {
  const roots = buildTodoTree(sampleTodos)

  it('finds a node by id', () => {
    expect(findNode(roots, 4)?.todo.title).toBe('grandchild')
    expect(findNode(roots, 999)).toBeNull()
  })

  it('finds the parent of a node', () => {
    expect(findParent(roots, 4)?.todo.title).toBe('child a')
    expect(findParent(roots, 1)).toBeNull()
  })

  it('treats roots as siblings of each other', () => {
    expect(titlesOf(findSiblings(roots, 1))).toEqual(['root', 'second root'])
  })

  it('moves between siblings and stops at the edges', () => {
    expect(findSibling(roots, 2, 1)?.todo.title).toBe('child b')
    expect(findSibling(roots, 3, -1)?.todo.title).toBe('child a')
    expect(findSibling(roots, 2, -1)).toBeNull()
    expect(findSibling(roots, 3, 1)).toBeNull()
  })

  it('returns null when the node is unknown', () => {
    expect(findSibling(roots, 999, 1)).toBeNull()
  })

  it('finds the first child', () => {
    expect(findFirstChild(roots, 1)?.todo.title).toBe('child a')
    expect(findFirstChild(roots, 4)).toBeNull()
  })

  it('finds the first and last sibling', () => {
    expect(findLastSibling(roots, 3, 'first')?.todo.title).toBe('child a')
    expect(findLastSibling(roots, 2, 'last')?.todo.title).toBe('child b')
  })
})
