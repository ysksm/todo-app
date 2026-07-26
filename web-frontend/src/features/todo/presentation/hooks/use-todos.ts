import { useCallback, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Todo, TodoDraft, TodoMove, TodoUpdate } from '../../domain/entities/todo'
import type { TodoDependencies } from '../../di/todo-dependencies'
import { confirmCascadingDelete } from '../confirm-cascading-delete'
import {
  selectSelectedTodo,
  selectTodoState,
  todoActions,
  type TodoViewMode,
} from '../store/todo-slice'

interface TodoState {
  todos: readonly Todo[]
  isLoading: boolean
  isSaving: boolean
  error: string | null
  selectedTodo: Todo | null
  viewMode: TodoViewMode
  reload(): Promise<void>
  create(title: string): Promise<boolean>
  createTodo(draft: TodoDraft): Promise<Todo | null>
  update(todo: TodoUpdate): Promise<boolean>
  move(todo: TodoMove): Promise<boolean>
  remove(id: number): Promise<boolean>
  updateDraft(todo: Todo): void
  openDialog(id: number): void
  closeDialog(): void
  changeViewMode(mode: TodoViewMode): void
}

export function useTodos(dependencies: TodoDependencies): TodoState {
  const dispatch = useDispatch()
  const { todos, status, error, viewMode } = useSelector(selectTodoState)
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

  /** 変更を保存して一覧を取り直す。失敗したら null を返す。 */
  const runMutation = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<T | null> => {
      dispatch(todoActions.requestStarted('saving'))
      try {
        const result = await operation()
        const todos = await dependencies.listTodos.execute()
        dispatch(todoActions.requestSucceeded(todos))
        return result
      } catch {
        dispatch(todoActions.requestFailed('Todo の保存に失敗しました。'))
        return null
      }
    },
    [dependencies, dispatch],
  )

  const createTodo = useCallback(
    (draft: TodoDraft) => runMutation(() => dependencies.createTodo.execute(draft)),
    [dependencies, runMutation],
  )

  const create = useCallback(
    async (title: string) => {
      const created = await createTodo({
        title,
        description: '',
        completed: false,
        parentId: null,
      })
      return created !== null
    },
    [createTodo],
  )

  const update = useCallback(
    async (todo: TodoUpdate) =>
      (await runMutation(() => dependencies.updateTodo.execute(todo))) !== null,
    [dependencies, runMutation],
  )

  const move = useCallback(
    async (todo: TodoMove) =>
      (await runMutation(() => dependencies.moveTodo.execute(todo))) !== null,
    [dependencies, runMutation],
  )

  // 削除は子孫まで波及するので、どのビューから呼ばれてもここで確認する。
  const remove = useCallback(
    async (id: number) => {
      if (!confirmCascadingDelete(todos, id)) {
        return false
      }

      return (
        (await runMutation(async () => {
          await dependencies.deleteTodo.execute(id)
          return true
        })) !== null
      )
    },
    [dependencies, runMutation, todos],
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

  const changeViewMode = useCallback(
    (mode: TodoViewMode) => {
      dispatch(todoActions.viewModeChanged(mode))
    },
    [dispatch],
  )

  return {
    todos,
    isLoading: status === 'loading',
    isSaving: status === 'saving',
    error,
    selectedTodo,
    viewMode,
    reload,
    create,
    createTodo,
    update,
    move,
    remove,
    updateDraft,
    openDialog,
    closeDialog,
    changeViewMode,
  }
}
