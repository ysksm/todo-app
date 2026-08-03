import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { TODO_STATUS_LABELS } from '../../../domain/entities/todo-status'
import { TODO_TYPE_LABELS } from '../../../domain/entities/todo-type'
import type { TodoNode } from '../../../domain/entities/todo-tree'
import { NODE_HEIGHT, NODE_WIDTH, type NodePosition } from '../../hooks/use-mindmap-layout'

interface MindmapNodeProps {
  node: TodoNode
  position: NodePosition
  isFocused: boolean
  isEditing: boolean
  isCollapsed: boolean
  isSaving: boolean
  onFocus(id: number): void
  onToggleCollapse(id: number): void
  onCycleStatus(node: TodoNode): void
  onStartEditing(id: number): void
  onCommitEditing(title: string): void
  onCancelEditing(): void
}

export function MindmapNode({
  node,
  position,
  isFocused,
  isEditing,
  isCollapsed,
  isSaving,
  onFocus,
  onToggleCollapse,
  onCycleStatus,
  onStartEditing,
  onCommitEditing,
  onCancelEditing,
}: MindmapNodeProps) {
  const { todo, depth, children } = node
  const hasChildren = children.length > 0

  const className = [
    'mindmap-node',
    isFocused && 'mindmap-node--focused',
    `mindmap-node--${todo.status}`,
    isEditing && 'mindmap-node--editing',
  ]
    .filter(Boolean)
    .join(' ')

  function stopAndRun(event: MouseEvent, run: () => void) {
    event.stopPropagation()
    run()
  }

  return (
    <div
      id={`mindmap-node-${todo.id}`}
      className={className}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={isFocused}
      aria-expanded={hasChildren ? !isCollapsed : undefined}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${NODE_WIDTH}px`,
        minHeight: `${NODE_HEIGHT}px`,
      }}
      onClick={() => onFocus(todo.id)}
      onDoubleClick={() => onStartEditing(todo.id)}
    >
      {hasChildren && (
        <button
          type="button"
          className="mindmap-node__toggle"
          tabIndex={-1}
          aria-label={`${todo.title} の子タスクを${isCollapsed ? '表示' : '隠す'}`}
          onClick={(event) => stopAndRun(event, () => onToggleCollapse(todo.id))}
        >
          {isCollapsed ? '+' : '−'}
        </button>
      )}

      {isEditing ? (
        <>
        <span className={`mindmap-node__type mindmap-node__type--${todo.type}`}>
          {TODO_TYPE_LABELS[todo.type]}
        </span>
        <MindmapNodeEditor
          initialTitle={todo.title}
          isSaving={isSaving}
          onCommit={onCommitEditing}
          onCancel={onCancelEditing}
        />
        </>
      ) : (
        <>
          <button
            type="button"
            className={`mindmap-node__status mindmap-node__status--${todo.status}`}
            tabIndex={-1}
            disabled={isSaving}
            aria-label={`${todo.title} の状態を切り替える（現在: ${TODO_STATUS_LABELS[todo.status]}）`}
            onClick={(event) => stopAndRun(event, () => onCycleStatus(node))}
          >
            {TODO_STATUS_LABELS[todo.status]}
          </button>
          <span className={`mindmap-node__type mindmap-node__type--${todo.type}`}>
            {TODO_TYPE_LABELS[todo.type]}
          </span>
          <span className="mindmap-node__title">{todo.title}</span>
          {hasChildren && isCollapsed && (
            <span className="mindmap-node__badge">{children.length}</span>
          )}
        </>
      )}
    </div>
  )
}

interface MindmapNodeEditorProps {
  initialTitle: string
  isSaving: boolean
  onCommit(title: string): void
  onCancel(): void
}

function MindmapNodeEditor({ initialTitle, isSaving, onCommit, onCancel }: MindmapNodeEditorProps) {
  const [title, setTitle] = useState(initialTitle)
  const inputRef = useRef<HTMLInputElement>(null)
  // Enter で確定した直後の blur で二重に確定させないための番人。
  const isSettledRef = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function settle(run: () => void) {
    if (isSettledRef.current) {
      return
    }
    isSettledRef.current = true
    run()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // コンテナのショートカットを誤爆させない。
    event.stopPropagation()

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      settle(() => onCommit(title))
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      settle(onCancel)
    }
  }

  return (
    <input
      ref={inputRef}
      className="mindmap-node__input"
      value={title}
      disabled={isSaving}
      placeholder="タスク名"
      aria-label="タスク名"
      onChange={(event) => setTitle(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      onBlur={() => settle(() => onCommit(title))}
    />
  )
}
