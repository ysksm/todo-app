import { describe, expect, it } from 'vitest'
import { todoActions, todoReducer } from './todo-slice'

describe('todoReducer', () => {
  it('stores fetched todos and clears the loading state', () => {
    const loadingState = todoReducer(undefined, todoActions.requestStarted('loading'))
    const state = todoReducer(
      loadingState,
      todoActions.requestSucceeded([
        { id: 1, title: 'Buy milk', description: '', completed: false },
      ]),
    )

    expect(state).toEqual({
      todos: [{ id: 1, title: 'Buy milk', description: '', completed: false }],
      status: 'idle',
      error: null,
      selectedTodoId: null,
    })
  })

  it('keeps dialog selection only while the selected todo exists', () => {
    const selectedState = todoReducer(
      todoReducer(undefined, todoActions.dialogOpened(1)),
      todoActions.requestSucceeded([
        { id: 1, title: 'Buy milk', description: '', completed: false },
      ]),
    )
    const stateAfterDelete = todoReducer(selectedState, todoActions.requestSucceeded([]))

    expect(stateAfterDelete.selectedTodoId).toBeNull()
  })

  it('updates the list immediately when a dialog field is committed', () => {
    const loadedState = todoReducer(
      undefined,
      todoActions.requestSucceeded([
        { id: 1, title: 'Buy milk', description: '', completed: false },
      ]),
    )
    const state = todoReducer(
      loadedState,
      todoActions.todoChanged({
        id: 1,
        title: 'Buy oat milk',
        description: '',
        completed: false,
      }),
    )

    expect(state.todos[0]?.title).toBe('Buy oat milk')
  })
})
