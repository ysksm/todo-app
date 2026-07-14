import { useCallback, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Todo, TodoUpdate } from '../../domain/entities/todo'
import type { TodoDependencies } from '../../di/todo-dependencies'
import { selectSelectedTodo, selectTodoState, todoActions } from '../store/todo-slice'

interface TodoState {
  todos: readonly Todo[]
  isLoading: boolean
  isSaving: boolean
  error: string | null
  selectedTodo: Todo | null
  reload(): Promise<void>
  create(title: string): Promise<boolean>
  update(todo: TodoUpdate): Promise<boolean>
  remove(id: number): Promise<boolean>
  updateDraft(todo: Todo): void
  openDialog(id: number): void
  closeDialog(): void
}

export function useTodos(dependencies: TodoDependencies): TodoState {
  const dispatch = useDispatch()
  const { todos, status, error } = useSelector(selectTodoState)
  const selectedTodo = useSelector(selectSelectedTodo)

  const reload = useCallback(async () => {
    dispatch(todoActions.requestStarted('loading'))
    try {
      const todos = await dependencies.listTodos.execute()
      dispatch(todoActions.requestSucceeded(todos))
    } catch {
      dispatch(todoActions.requestFailed('Todo の読み込みに失敗しました。'))
    }
  }, [dependencies, dispatch])

  useEffect(() => {
    void reload()
  }, [reload])

  const runMutation = useCallback(
    async (operation: () => Promise<void>): Promise<boolean> => {
      dispatch(todoActions.requestStarted('saving'))
      try {
        await operation()
        const todos = await dependencies.listTodos.execute()
        dispatch(todoActions.requestSucceeded(todos))
        return true
      } catch {
        dispatch(todoActions.requestFailed('Todo の保存に失敗しました。'))
        return false
      }
    },
    [dependencies, dispatch],
  )

  const create = useCallback(
    (title: string) =>
      runMutation(async () => {
        await dependencies.createTodo.execute({ title, description: '', completed: false })
      }),
    [dependencies, runMutation],
  )

  const update = useCallback(
    (todo: TodoUpdate) => runMutation(() => dependencies.updateTodo.execute(todo).then(() => undefined)),
    [dependencies, runMutation],
  )

  const remove = useCallback(
    (id: number) => runMutation(() => dependencies.deleteTodo.execute(id)),
    [dependencies, runMutation],
  )

  const updateDraft = useCallback(
    (todo: Todo) => {
      dispatch(todoActions.todoChanged(todo))
    },
    [dispatch],
  )

  const openDialog = useCallback(
    (id: number) => {
      dispatch(todoActions.dialogOpened(id))
    },
    [dispatch],
  )

  const closeDialog = useCallback(() => {
    dispatch(todoActions.dialogClosed())
  }, [dispatch])

  return {
    todos,
    isLoading: status === 'loading',
    isSaving: status === 'saving',
    error,
    selectedTodo,
    reload,
    create,
    update,
    remove,
    updateDraft,
    openDialog,
    closeDialog,
  }
}
