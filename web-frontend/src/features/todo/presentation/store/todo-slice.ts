import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Todo } from '../../domain/entities/todo'

type TodoRequestStatus = 'idle' | 'loading' | 'saving'

export type TodoViewMode = 'list' | 'mindmap'

/** まだ保存されていない新規ノードの仮 id。実 id と衝突しないよう負の値を使う。 */
export const DRAFT_TODO_ID = -1

/** タイトル入力中の仮ノード。確定時に初めて API へ送る。 */
export interface TodoDraftNode {
  parentId: number | null
  position: number
}

export interface TodoStoreState {
  todos: Todo[]
  status: TodoRequestStatus
  error: string | null
  selectedTodoId: number | null
  viewMode: TodoViewMode
  focusedTodoId: number | null
  editingTodoId: number | null
  collapsedIds: number[]
  draftNode: TodoDraftNode | null
}

interface TodoStoreRootState {
  todo: TodoStoreState
}

const initialState: TodoStoreState = {
  todos: [],
  status: 'idle',
  error: null,
  selectedTodoId: null,
  viewMode: 'list',
  focusedTodoId: null,
  editingTodoId: null,
  collapsedIds: [],
  draftNode: null,
}

const todoSlice = createSlice({
  name: 'todo',
  initialState,
  reducers: {
    requestStarted(state, action: PayloadAction<Exclude<TodoRequestStatus, 'idle'>>) {
      state.status = action.payload
      state.error = null
    },
    requestSucceeded(state, action: PayloadAction<readonly Todo[]>) {
      state.todos = [...action.payload]
      state.status = 'idle'
      state.error = null

      const existingIds = new Set(state.todos.map((todo) => todo.id))
      if (state.selectedTodoId !== null && !existingIds.has(state.selectedTodoId)) {
        state.selectedTodoId = null
      }
      if (state.focusedTodoId !== null && !existingIds.has(state.focusedTodoId)) {
        state.focusedTodoId = null
      }
      if (
        state.editingTodoId !== null &&
        state.editingTodoId !== DRAFT_TODO_ID &&
        !existingIds.has(state.editingTodoId)
      ) {
        state.editingTodoId = null
      }
      state.collapsedIds = state.collapsedIds.filter((id) => existingIds.has(id))
    },
    requestFailed(state, action: PayloadAction<string>) {
      state.status = 'idle'
      state.error = action.payload
    },
    todoChanged(state, action: PayloadAction<Todo>) {
      const index = state.todos.findIndex((todo) => todo.id === action.payload.id)
      if (index !== -1) {
        state.todos[index] = action.payload
      }
    },
    dialogOpened(state, action: PayloadAction<number>) {
      state.selectedTodoId = action.payload
    },
    dialogClosed(state) {
      state.selectedTodoId = null
    },
    viewModeChanged(state, action: PayloadAction<TodoViewMode>) {
      state.viewMode = action.payload
      state.editingTodoId = null
      state.draftNode = null
    },
    focusMoved(state, action: PayloadAction<number | null>) {
      state.focusedTodoId = action.payload
    },
    editingStarted(state, action: PayloadAction<number>) {
      state.editingTodoId = action.payload
    },
    editingStopped(state) {
      state.editingTodoId = null
      state.draftNode = null
    },
    collapseToggled(state, action: PayloadAction<number>) {
      const index = state.collapsedIds.indexOf(action.payload)
      if (index === -1) {
        state.collapsedIds.push(action.payload)
      } else {
        state.collapsedIds.splice(index, 1)
      }
    },
    expanded(state, action: PayloadAction<number>) {
      state.collapsedIds = state.collapsedIds.filter((id) => id !== action.payload)
    },
    draftStarted(state, action: PayloadAction<TodoDraftNode>) {
      state.draftNode = action.payload
      state.editingTodoId = DRAFT_TODO_ID
      state.focusedTodoId = DRAFT_TODO_ID
    },
    draftDiscarded(state) {
      state.draftNode = null
      if (state.editingTodoId === DRAFT_TODO_ID) {
        state.editingTodoId = null
      }
      if (state.focusedTodoId === DRAFT_TODO_ID) {
        state.focusedTodoId = null
      }
    },
  },
})

export const todoActions = todoSlice.actions
export const todoReducer = todoSlice.reducer

export function selectTodoState(state: TodoStoreRootState): TodoStoreState {
  return state.todo
}

export function selectSelectedTodo(state: TodoStoreRootState): Todo | null {
  return state.todo.todos.find((todo) => todo.id === state.todo.selectedTodoId) ?? null
}
