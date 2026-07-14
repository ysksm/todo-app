import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Todo } from '../../domain/entities/todo'

type TodoRequestStatus = 'idle' | 'loading' | 'saving'

export interface TodoStoreState {
  todos: Todo[]
  status: TodoRequestStatus
  error: string | null
  selectedTodoId: number | null
}

interface TodoStoreRootState {
  todo: TodoStoreState
}

const initialState: TodoStoreState = {
  todos: [],
  status: 'idle',
  error: null,
  selectedTodoId: null,
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
      if (!state.todos.some((todo) => todo.id === state.selectedTodoId)) {
        state.selectedTodoId = null
      }
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
