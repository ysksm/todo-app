import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Todo, TodoDraft, TodoMove, TodoUpdate } from '../../../domain/entities/todo'
import { nextStatus } from '../../../domain/entities/todo-status'
import type { TodoNode } from '../../../domain/entities/todo-tree'
import { useMindmapNavigation } from '../../hooks/use-mindmap-navigation'
import { MindmapNode } from './mindmap-node'
import { MindmapHelp } from './mindmap-help'

interface MindmapViewProps {
  todos: readonly Todo[]
  isSaving: boolean
  onCreate(draft: TodoDraft): Promise<Todo | null>
  onUpdate(todo: TodoUpdate): Promise<boolean>
  onMove(move: TodoMove): Promise<boolean>
  onDelete(id: number): Promise<boolean>
}

export function MindmapView({
  todos,
  isSaving,
  onCreate,
  onUpdate,
  onMove,
  onDelete,
}: MindmapViewProps) {
  const navigation = useMindmapNavigation({
    todos,
    isSaving,
    onCreate,
    onUpdate,
    onMove,
    onDelete,
  })
  const { layout, focusedId, editingId, collapsedIds } = navigation

  const containerRef = useRef<HTMLDivElement>(null)
  const [isHelpOpen, setIsHelpOpen] = useState(false)

  // 編集を抜けたらキー操作を受け取れるようコンテナへフォーカスを戻す。
  useEffect(() => {
    if (editingId === null) {
      containerRef.current?.focus()
    }
  }, [editingId])

  useEffect(() => {
    if (focusedId === null) {
      return
    }
    document
      .getElementById(`mindmap-node-${focusedId}`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [focusedId])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === '?') {
      event.preventDefault()
      setIsHelpOpen((isOpen) => !isOpen)
      return
    }
    navigation.handleKeyDown(event)
  }

  function cycleStatus(node: TodoNode) {
    void onUpdate({
      id: node.todo.id,
      title: node.todo.title,
      description: node.todo.description,
      status: nextStatus(node.todo.status),
      type: node.todo.type,
    })
  }

  return (
    <div className="mindmap">
      <div className="mindmap__toolbar">
        <p className="mindmap__hint">
          矢印キーで移動、<kbd>F2</kbd> で名前を編集、<kbd>Enter</kbd> で兄弟を追加。
        </p>
        <button
          type="button"
          className="mindmap__help-toggle"
          aria-expanded={isHelpOpen}
          onClick={() => setIsHelpOpen((isOpen) => !isOpen)}
        >
          キー操作
        </button>
      </div>

      {isHelpOpen && <MindmapHelp onClose={() => setIsHelpOpen(false)} />}

      <div
        ref={containerRef}
        className="mindmap__canvas"
        role="tree"
        tabIndex={0}
        aria-label="タスクのマインドマップ"
        aria-activedescendant={focusedId === null ? undefined : `mindmap-node-${focusedId}`}
        onKeyDown={handleKeyDown}
      >
        {layout.visibleNodes.length === 0 ? (
          <p className="mindmap__empty">
            タスクがありません。<kbd>Enter</kbd> で最初のタスクを追加できます。
          </p>
        ) : (
          <div
            className="mindmap__surface"
            style={{ width: `${layout.width}px`, height: `${layout.height}px` }}
          >
            <svg className="mindmap__edges" width={layout.width} height={layout.height} aria-hidden>
              {layout.edges.map((edge) => (
                <path key={`${edge.parentId}-${edge.childId}`} d={edge.path} />
              ))}
            </svg>

            {layout.visibleNodes.map((node) => (
              <MindmapNode
                key={node.todo.id}
                node={node}
                position={layout.positions.get(node.todo.id)!}
                isFocused={node.todo.id === focusedId}
                isEditing={node.todo.id === editingId}
                isCollapsed={collapsedIds.has(node.todo.id)}
                isSaving={isSaving}
                onFocus={navigation.focusNode}
                onToggleCollapse={navigation.toggleCollapse}
                onCycleStatus={cycleStatus}
                onStartEditing={navigation.startEditing}
                onCommitEditing={(title) => void navigation.commitEditing(title)}
                onCancelEditing={navigation.cancelEditing}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
