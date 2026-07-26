import type { Todo } from './todo'

export interface TodoNode {
  readonly todo: Todo
  readonly depth: number
  readonly children: readonly TodoNode[]
}

/**
 * フラットな Todo 配列を木に組み立てる。
 * - 親が見つからない Todo はルートとして扱う
 * - ルートは複数存在しうる（森）
 * - 万一循環していても、到達できなかった Todo をルートへ回収するので全件が必ず現れる
 */
export function buildTodoTree(todos: readonly Todo[]): readonly TodoNode[] {
  const existingIds = new Set(todos.map((todo) => todo.id))
  const childrenByParent = new Map<number | null, Todo[]>()

  for (const todo of todos) {
    const parentId =
      todo.parentId !== null && todo.parentId !== todo.id && existingIds.has(todo.parentId)
        ? todo.parentId
        : null
    const siblings = childrenByParent.get(parentId)
    if (siblings) {
      siblings.push(todo)
    } else {
      childrenByParent.set(parentId, [todo])
    }
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort((left, right) => left.position - right.position || left.id - right.id)
  }

  const visitedIds = new Set<number>()

  function buildNode(todo: Todo, depth: number): TodoNode {
    visitedIds.add(todo.id)
    const children = (childrenByParent.get(todo.id) ?? [])
      .filter((child) => !visitedIds.has(child.id))
      .map((child) => buildNode(child, depth + 1))
    return { todo, depth, children }
  }

  const roots = (childrenByParent.get(null) ?? []).map((todo) => buildNode(todo, 0))

  // 循環していて上のルートから辿れなかった Todo を、取りこぼさないよう回収する。
  for (const todo of todos) {
    if (!visitedIds.has(todo.id)) {
      roots.push(buildNode(todo, 0))
    }
  }

  return roots
}

/**
 * ある Todo の子孫の数。木を組み立てずにフラットな配列から直接数える。
 * 削除がどこまで波及するかを、どのビューからでも同じ基準で判断するために使う。
 */
export function countDescendants(todos: readonly Todo[], id: number): number {
  const childIdsByParent = new Map<number, number[]>()
  for (const todo of todos) {
    if (todo.parentId === null || todo.parentId === todo.id) {
      continue
    }
    const siblings = childIdsByParent.get(todo.parentId)
    if (siblings) {
      siblings.push(todo.id)
    } else {
      childIdsByParent.set(todo.parentId, [todo.id])
    }
  }

  const counted = new Set<number>()
  const stack = [...(childIdsByParent.get(id) ?? [])]
  while (stack.length > 0) {
    const currentId = stack.pop()!
    if (counted.has(currentId) || currentId === id) {
      continue
    }
    counted.add(currentId)
    stack.push(...(childIdsByParent.get(currentId) ?? []))
  }
  return counted.size
}

/** 木を深さ優先で 1 次元に並べる。 */
export function flattenTree(roots: readonly TodoNode[]): readonly TodoNode[] {
  const flattened: TodoNode[] = []
  const visit = (nodes: readonly TodoNode[]) => {
    for (const node of nodes) {
      flattened.push(node)
      visit(node.children)
    }
  }
  visit(roots)
  return flattened
}

export function findNode(roots: readonly TodoNode[], id: number): TodoNode | null {
  return flattenTree(roots).find((node) => node.todo.id === id) ?? null
}

export function findParent(roots: readonly TodoNode[], id: number): TodoNode | null {
  return (
    flattenTree(roots).find((node) => node.children.some((child) => child.todo.id === id)) ?? null
  )
}

/** 同じ親を持つノードの並び。ルートどうしも兄弟として扱う。 */
export function findSiblings(roots: readonly TodoNode[], id: number): readonly TodoNode[] {
  const parent = findParent(roots, id)
  return parent ? parent.children : roots
}

export function findSibling(
  roots: readonly TodoNode[],
  id: number,
  offset: number,
): TodoNode | null {
  const siblings = findSiblings(roots, id)
  const index = siblings.findIndex((node) => node.todo.id === id)
  if (index === -1) {
    return null
  }
  return siblings[index + offset] ?? null
}

export function findFirstChild(roots: readonly TodoNode[], id: number): TodoNode | null {
  return findNode(roots, id)?.children[0] ?? null
}

export function findLastSibling(
  roots: readonly TodoNode[],
  id: number,
  edge: 'first' | 'last',
): TodoNode | null {
  const siblings = findSiblings(roots, id)
  const node = edge === 'first' ? siblings[0] : siblings[siblings.length - 1]
  return node ?? null
}
