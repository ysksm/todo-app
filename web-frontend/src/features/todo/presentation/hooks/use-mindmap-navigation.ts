import { useCallback, useMemo, type KeyboardEvent } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Todo, TodoDraft, TodoMove, TodoUpdate } from '../../domain/entities/todo'
import {
  buildTodoTree,
  findFirstChild,
  findLastSibling,
  findNode,
  findParent,
  findSibling,
  type TodoNode,
} from '../../domain/entities/todo-tree'
import {
  DRAFT_TODO_ID,
  selectTodoState,
  todoActions,
  type TodoDraftNode,
} from '../store/todo-slice'
import { useMindmapLayout, type MindmapLayout } from './use-mindmap-layout'

export interface MindmapNavigationOptions {
  todos: readonly Todo[]
  isSaving: boolean
  onCreate(draft: TodoDraft): Promise<Todo | null>
  onUpdate(todo: TodoUpdate): Promise<boolean>
  onMove(move: TodoMove): Promise<boolean>
  /** 削除。子孫ごと消える確認は呼び出し側（useTodos）が済ませる。 */
  onDelete(id: number): Promise<boolean>
}

export interface MindmapNavigation {
  roots: readonly TodoNode[]
  layout: MindmapLayout
  focusedId: number | null
  editingId: number | null
  collapsedIds: ReadonlySet<number>
  focusNode(id: number): void
  toggleCollapse(id: number): void
  startEditing(id: number): void
  commitEditing(title: string): Promise<void>
  cancelEditing(): void
  handleKeyDown(event: KeyboardEvent<HTMLElement>): void
}

const EMPTY_DRAFT_TITLE = ''

export function useMindmapNavigation(options: MindmapNavigationOptions): MindmapNavigation {
  const { todos, isSaving, onCreate, onUpdate, onMove, onDelete } = options
  const dispatch = useDispatch()
  const { focusedTodoId, editingTodoId, collapsedIds: collapsedIdList, draftNode } =
    useSelector(selectTodoState)

  const todosWithDraft = useMemo(
    () => (draftNode ? [...todos, toDraftTodo(draftNode)] : todos),
    [todos, draftNode],
  )
  const roots = useMemo(() => buildTodoTree(todosWithDraft), [todosWithDraft])
  const collapsedIds = useMemo(() => new Set(collapsedIdList), [collapsedIdList])
  const layout = useMindmapLayout(roots, collapsedIds)

  const visibleIds = useMemo(
    () => new Set(layout.visibleNodes.map((node) => node.todo.id)),
    [layout],
  )

  /**
   * カーソル位置を「いま画面に出ているノード」へ丸める。
   *
   * 親を折りたたむと子は DOM から消えるので、その子にカーソルがあると
   * aria-activedescendant が存在しない要素を指し、キー操作も見えない位置から続いてしまう。
   * 隠れた場合はいちばん近い表示中の祖先へ、それも無ければ先頭のノードへ寄せる。
   * ストアの focusedTodoId 自体は残すので、折りたたみを開くと元の位置へ戻る。
   */
  const focusedId = useMemo(() => {
    if (focusedTodoId !== null && visibleIds.has(focusedTodoId)) {
      return focusedTodoId
    }

    if (focusedTodoId !== null) {
      let ancestor = findParent(roots, focusedTodoId)
      while (ancestor && !visibleIds.has(ancestor.todo.id)) {
        ancestor = findParent(roots, ancestor.todo.id)
      }
      if (ancestor) {
        return ancestor.todo.id
      }
    }

    return layout.visibleNodes[0]?.todo.id ?? null
  }, [focusedTodoId, layout, roots, visibleIds])

  const focusedNode = focusedId === null ? null : findNode(roots, focusedId)

  const focusNode = useCallback(
    (id: number) => {
      dispatch(todoActions.focusMoved(id))
    },
    [dispatch],
  )

  const toggleCollapse = useCallback(
    (id: number) => {
      dispatch(todoActions.collapseToggled(id))
    },
    [dispatch],
  )

  const startEditing = useCallback(
    (id: number) => {
      dispatch(todoActions.focusMoved(id))
      dispatch(todoActions.editingStarted(id))
    },
    [dispatch],
  )

  const cancelEditing = useCallback(() => {
    if (editingTodoId === DRAFT_TODO_ID) {
      dispatch(todoActions.draftDiscarded())
      return
    }
    dispatch(todoActions.editingStopped())
  }, [dispatch, editingTodoId])

  const commitEditing = useCallback(
    async (title: string) => {
      if (editingTodoId === null) {
        return
      }

      const trimmedTitle = title.trim()

      if (editingTodoId === DRAFT_TODO_ID) {
        if (!draftNode || !trimmedTitle) {
          dispatch(todoActions.draftDiscarded())
          return
        }

        const siblings = todos.filter((todo) => todo.parentId === draftNode.parentId)
        const targetIndex = siblings.filter((todo) => todo.position < draftNode.position).length

        const created = await onCreate({
          title: trimmedTitle,
          description: '',
          completed: false,
          parentId: draftNode.parentId,
        })
        dispatch(todoActions.draftDiscarded())

        if (!created) {
          return
        }
        if (targetIndex < siblings.length) {
          await onMove({ id: created.id, parentId: draftNode.parentId, position: targetIndex })
        }
        dispatch(todoActions.focusMoved(created.id))
        return
      }

      const editedTodo = todos.find((todo) => todo.id === editingTodoId)
      if (editedTodo && trimmedTitle && trimmedTitle !== editedTodo.title) {
        await onUpdate({
          id: editedTodo.id,
          title: trimmedTitle,
          description: editedTodo.description,
          completed: editedTodo.completed,
        })
      }
      dispatch(todoActions.editingStopped())
    },
    [dispatch, draftNode, editingTodoId, onCreate, onMove, onUpdate, todos],
  )

  const startDraft = useCallback(
    (draft: TodoDraftNode) => {
      dispatch(todoActions.draftStarted(draft))
    },
    [dispatch],
  )

  const removeFocusedNode = useCallback(
    async (node: TodoNode) => {
      const fallback =
        findSibling(roots, node.todo.id, -1) ??
        findSibling(roots, node.todo.id, 1) ??
        findParent(roots, node.todo.id)

      if (await onDelete(node.todo.id)) {
        dispatch(todoActions.focusMoved(fallback?.todo.id ?? null))
      }
    },
    [dispatch, onDelete, roots],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      // 編集中のキー入力は input 側で処理する。
      if (editingTodoId !== null) {
        return
      }

      // まだ 1 件も無いときは Enter で最初のルートを作れるようにする。
      if (!focusedNode) {
        if (event.key === 'Enter' && !isSaving) {
          event.preventDefault()
          startDraft({ parentId: null, position: 0 })
        }
        return
      }

      const node = focusedNode
      const id = node.todo.id
      const isCollapsed = collapsedIds.has(id)

      switch (event.key) {
        case 'ArrowRight': {
          event.preventDefault()
          if (node.children.length === 0) {
            return
          }
          if (isCollapsed) {
            dispatch(todoActions.expanded(id))
            return
          }
          const firstChild = findFirstChild(roots, id)
          if (firstChild) {
            focusNode(firstChild.todo.id)
          }
          return
        }
        case 'ArrowLeft': {
          event.preventDefault()
          const parent = findParent(roots, id)
          if (parent) {
            focusNode(parent.todo.id)
          }
          return
        }
        case 'ArrowUp':
        case 'ArrowDown': {
          event.preventDefault()
          const sibling = findSibling(roots, id, event.key === 'ArrowUp' ? -1 : 1)
          if (sibling) {
            focusNode(sibling.todo.id)
          }
          return
        }
        case 'Home':
        case 'End': {
          event.preventDefault()
          const edge = findLastSibling(roots, id, event.key === 'Home' ? 'first' : 'last')
          if (edge) {
            focusNode(edge.todo.id)
          }
          return
        }
        case 'F2': {
          event.preventDefault()
          startEditing(id)
          return
        }
        case 'Enter': {
          event.preventDefault()
          if (isSaving) {
            return
          }
          startDraft({
            parentId: findParent(roots, id)?.todo.id ?? null,
            position: node.todo.position + 0.5,
          })
          return
        }
        case 'Tab': {
          event.preventDefault()
          if (isSaving) {
            return
          }
          dispatch(todoActions.expanded(id))
          startDraft({
            parentId: id,
            position: nextChildPosition(node),
          })
          return
        }
        case 'Delete':
        case 'Backspace': {
          event.preventDefault()
          if (isSaving) {
            return
          }
          void removeFocusedNode(node)
          return
        }
        case ' ': {
          event.preventDefault()
          if (isSaving) {
            return
          }
          void onUpdate({
            id: node.todo.id,
            title: node.todo.title,
            description: node.todo.description,
            completed: !node.todo.completed,
          })
          return
        }
        default:
      }
    },
    [
      collapsedIds,
      dispatch,
      editingTodoId,
      focusNode,
      focusedNode,
      isSaving,
      onUpdate,
      removeFocusedNode,
      roots,
      startDraft,
      startEditing,
    ],
  )

  return {
    roots,
    layout,
    focusedId,
    editingId: editingTodoId,
    collapsedIds,
    focusNode,
    toggleCollapse,
    startEditing,
    commitEditing,
    cancelEditing,
    handleKeyDown,
  }
}

function toDraftTodo(draftNode: TodoDraftNode): Todo {
  return {
    id: DRAFT_TODO_ID,
    title: EMPTY_DRAFT_TITLE,
    description: '',
    completed: false,
    parentId: draftNode.parentId,
    position: draftNode.position,
  }
}

function nextChildPosition(node: TodoNode): number {
  const lastChild = node.children[node.children.length - 1]
  return lastChild ? lastChild.todo.position + 1 : 0
}
