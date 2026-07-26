import { describe, expect, it } from 'vitest'
import type { Todo } from '../../domain/entities/todo'
import { DRAFT_TODO_ID, todoActions, todoReducer } from './todo-slice'

function todo(id: number, parentId: number | null = null, title = `todo-${id}`): Todo {
  return { id, title, description: '', completed: false, type: 'task', parentId, position: 0 }
}

describe('todoReducer', () => {
  it('stores fetched todos and clears the loading state', () => {
    const loadingState = todoReducer(undefined, todoActions.requestStarted('loading'))
    const state = todoReducer(loadingState, todoActions.requestSucceeded([todo(1, null, 'Buy milk')]))

    expect(state.todos).toEqual([todo(1, null, 'Buy milk')])
    expect(state.status).toBe('idle')
    expect(state.error).toBeNull()
  })

  it('keeps dialog selection only while the selected todo exists', () => {
    const selectedState = todoReducer(
      todoReducer(undefined, todoActions.dialogOpened(1)),
      todoActions.requestSucceeded([todo(1)]),
    )
    const stateAfterDelete = todoReducer(selectedState, todoActions.requestSucceeded([]))

    expect(stateAfterDelete.selectedTodoId).toBeNull()
  })

  it('updates the list immediately when a dialog field is committed', () => {
    const loadedState = todoReducer(undefined, todoActions.requestSucceeded([todo(1, null, 'Buy milk')]))
    const state = todoReducer(loadedState, todoActions.todoChanged(todo(1, null, 'Buy oat milk')))

    expect(state.todos[0]?.title).toBe('Buy oat milk')
  })

  it('drops focus, editing and collapse state for todos that disappeared', () => {
    let state = todoReducer(undefined, todoActions.requestSucceeded([todo(1), todo(2, 1)]))
    state = todoReducer(state, todoActions.focusMoved(2))
    state = todoReducer(state, todoActions.editingStarted(2))
    state = todoReducer(state, todoActions.collapseToggled(1))
    state = todoReducer(state, todoActions.collapseToggled(2))

    const afterDelete = todoReducer(state, todoActions.requestSucceeded([todo(1)]))

    expect(afterDelete.focusedTodoId).toBeNull()
    expect(afterDelete.editingTodoId).toBeNull()
    expect(afterDelete.collapsedIds).toEqual([1])
  })

  it('keeps focus and editing state for todos that still exist', () => {
    let state = todoReducer(undefined, todoActions.requestSucceeded([todo(1)]))
    state = todoReducer(state, todoActions.focusMoved(1))
    state = todoReducer(state, todoActions.editingStarted(1))

    const afterReload = todoReducer(state, todoActions.requestSucceeded([todo(1), todo(2)]))

    expect(afterReload.focusedTodoId).toBe(1)
    expect(afterReload.editingTodoId).toBe(1)
  })

  it('toggles the collapsed state of a node', () => {
    const collapsed = todoReducer(undefined, todoActions.collapseToggled(1))
    expect(collapsed.collapsedIds).toEqual([1])

    const expandedByToggle = todoReducer(collapsed, todoActions.collapseToggled(1))
    expect(expandedByToggle.collapsedIds).toEqual([])

    const expandedExplicitly = todoReducer(collapsed, todoActions.expanded(1))
    expect(expandedExplicitly.collapsedIds).toEqual([])
  })

  it('focuses and edits the draft node while it is open', () => {
    const state = todoReducer(undefined, todoActions.draftStarted({ parentId: 1, position: 0.5, type: 'subtask' }))

    expect(state.draftNode).toEqual({ parentId: 1, position: 0.5, type: 'subtask' })
    expect(state.editingTodoId).toBe(DRAFT_TODO_ID)
    expect(state.focusedTodoId).toBe(DRAFT_TODO_ID)

    const discarded = todoReducer(state, todoActions.draftDiscarded())
    expect(discarded.draftNode).toBeNull()
    expect(discarded.editingTodoId).toBeNull()
    expect(discarded.focusedTodoId).toBeNull()
  })

  it('does not clear the draft editing state when the list reloads', () => {
    const state = todoReducer(
      todoReducer(undefined, todoActions.draftStarted({ parentId: null, position: 0, type: 'product' })),
      todoActions.requestSucceeded([todo(1)]),
    )

    expect(state.editingTodoId).toBe(DRAFT_TODO_ID)
  })

  it('leaves editing when the view mode changes', () => {
    const state = todoReducer(
      todoReducer(undefined, todoActions.editingStarted(1)),
      todoActions.viewModeChanged('mindmap'),
    )

    expect(state.viewMode).toBe('mindmap')
    expect(state.editingTodoId).toBeNull()
  })
})
