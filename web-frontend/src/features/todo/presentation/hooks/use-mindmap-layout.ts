import { useMemo } from 'react'
import type { TodoNode } from '../../domain/entities/todo-tree'

// 種類のバッジとタイトルが並ぶ幅。
export const NODE_WIDTH = 268
export const NODE_HEIGHT = 44
export const H_GAP = 64
export const V_GAP = 12
const CANVAS_PADDING = 24

export interface NodePosition {
  readonly x: number
  readonly y: number
}

export interface MindmapEdge {
  readonly parentId: number
  readonly childId: number
  readonly path: string
}

export interface MindmapLayout {
  /** ノード id -> 左上の座標 */
  readonly positions: ReadonlyMap<number, NodePosition>
  /** 親から子へ伸びるベジエ曲線 */
  readonly edges: readonly MindmapEdge[]
  /** 描画順（親が先）に並んだ、折りたたみで隠れていないノード */
  readonly visibleNodes: readonly TodoNode[]
  readonly width: number
  readonly height: number
}

/**
 * 左→右のトーナメント表として木を配置する。
 * 深さが列（x）、兄弟が行（y）に対応し、子を持つノードは先頭の子と末尾の子の中点に置く。
 */
export function layoutMindmap(
  roots: readonly TodoNode[],
  collapsedIds: ReadonlySet<number> = new Set(),
): MindmapLayout {
  const positions = new Map<number, NodePosition>()
  const edges: MindmapEdge[] = []
  const visibleNodes: TodoNode[] = []
  let nextLeafY = CANVAS_PADDING

  function place(node: TodoNode): number {
    visibleNodes.push(node)
    const x = CANVAS_PADDING + node.depth * (NODE_WIDTH + H_GAP)
    const children = collapsedIds.has(node.todo.id) ? [] : node.children

    let y: number
    if (children.length === 0) {
      y = nextLeafY
      nextLeafY += NODE_HEIGHT + V_GAP
    } else {
      const childCenters = children.map(place)
      y = (childCenters[0] + childCenters[childCenters.length - 1]) / 2
    }

    positions.set(node.todo.id, { x, y })
    for (const child of children) {
      edges.push({
        parentId: node.todo.id,
        childId: child.todo.id,
        path: edgePath(x, y, positions.get(child.todo.id)!),
      })
    }
    return y
  }

  for (const root of roots) {
    place(root)
  }

  const maxDepth = visibleNodes.reduce((depth, node) => Math.max(depth, node.depth), 0)
  const width = CANVAS_PADDING * 2 + (maxDepth + 1) * NODE_WIDTH + maxDepth * H_GAP
  const height = Math.max(nextLeafY - V_GAP + CANVAS_PADDING, CANVAS_PADDING * 2 + NODE_HEIGHT)

  return { positions, edges, visibleNodes, width, height }
}

function edgePath(parentX: number, parentY: number, child: NodePosition): string {
  const startX = parentX + NODE_WIDTH
  const startY = parentY + NODE_HEIGHT / 2
  const endX = child.x
  const endY = child.y + NODE_HEIGHT / 2
  const controlOffset = H_GAP / 2

  return `M ${startX},${startY} C ${startX + controlOffset},${startY} ${endX - controlOffset},${endY} ${endX},${endY}`
}

export function useMindmapLayout(
  roots: readonly TodoNode[],
  collapsedIds: ReadonlySet<number>,
): MindmapLayout {
  return useMemo(() => layoutMindmap(roots, collapsedIds), [roots, collapsedIds])
}
