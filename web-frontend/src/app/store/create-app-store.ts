import { configureStore } from '@reduxjs/toolkit'
import { todoReducer } from '@/features/todo/presentation/store/todo-slice'

export function createAppStore() {
  return configureStore({
    reducer: {
      todo: todoReducer,
    },
  })
}
