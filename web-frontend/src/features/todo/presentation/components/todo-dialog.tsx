import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Todo } from '../../domain/entities/todo'
import {
  TODO_TYPE_LABELS,
  selectableTypes,
  type TodoType,
} from '../../domain/entities/todo-type'

interface TodoDialogProps {
  todo: Todo | null
  /** 選べる種類は親と子で決まるので、周りの Todo も要る。 */
  todos: readonly Todo[]
  isSaving: boolean
  onDraftChange(todo: Todo): void
  onUpdate(todo: Todo): Promise<boolean>
  onDelete(id: number): Promise<boolean>
  onClose(): void
}

export function TodoDialog({
  todo,
  todos,
  isSaving,
  onDraftChange,
  onUpdate,
  onDelete,
  onClose,
}: TodoDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [completed, setCompleted] = useState(false)
  const [type, setType] = useState<TodoType>('task')

  const parentType = useMemo(() => {
    if (!todo || todo.parentId === null) {
      return null
    }
    return todos.find((candidate) => candidate.id === todo.parentId)?.type ?? null
  }, [todo, todos])

  const availableTypes = useMemo(() => {
    if (!todo) {
      return []
    }
    const childTypes = todos
      .filter((candidate) => candidate.parentId === todo.id)
      .map((child) => child.type)
    // 保存済みの種類は、階層に合わなくなっていても選択肢に残す（選べない値が表示されないように）。
    const types = selectableTypes(parentType, childTypes)
    return types.includes(todo.type) ? types : [todo.type, ...types]
  }, [parentType, todo, todos])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    if (todo && !dialog.open) {
      dialog.showModal()
    }
    if (!todo && dialog.open) {
      dialog.close()
    }
  }, [todo])

  useEffect(() => {
    if (todo) {
      setTitle(todo.title)
      setDescription(todo.description)
      setCompleted(todo.completed)
      setType(todo.type)
    }
  }, [todo])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!todo || isSaving || !title.trim()) {
      return
    }

    if (await onUpdate({ ...todo, title, description, completed, type })) {
      onClose()
    }
  }

  function commitDraft() {
    if (todo) {
      onDraftChange({ ...todo, title, description, completed, type })
    }
  }

  async function handleDelete() {
    if (todo && await onDelete(todo.id)) {
      onClose()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="todo-dialog"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      {todo && (
        <form method="dialog" onSubmit={handleSubmit}>
          <header className="todo-dialog__header">
            <h2>Todo を編集</h2>
            <button type="button" className="todo-dialog__close" onClick={onClose} aria-label="閉じる">×</button>
          </header>
          <label htmlFor="dialog-todo-title">Todo 名</label>
          <input
            id="dialog-todo-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commitDraft}
            disabled={isSaving}
          />
          <label htmlFor="dialog-todo-type">種類</label>
          <select
            id="dialog-todo-type"
            value={type}
            onChange={(event) => setType(event.target.value as TodoType)}
            disabled={isSaving}
          >
            {availableTypes.map((todoType) => (
              <option key={todoType} value={todoType}>
                {TODO_TYPE_LABELS[todoType]}
              </option>
            ))}
          </select>
          <small className="todo-dialog__hint">
            {parentType === null
              ? '親と子の種類に合う種類だけ選べます。'
              : `親は ${TODO_TYPE_LABELS[parentType]} です。その下に置ける種類だけ選べます。`}
          </small>
          <label htmlFor="dialog-todo-description">詳細</label>
          <textarea
            id="dialog-todo-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={commitDraft}
            disabled={isSaving}
          />
          <label className="todo-dialog__completed">
            <input
              type="checkbox"
              checked={completed}
              onChange={(event) => setCompleted(event.target.checked)}
              disabled={isSaving}
            />
            完了
          </label>
          <footer className="todo-dialog__actions">
            <button type="button" className="todo-dialog__delete" onClick={() => void handleDelete()} disabled={isSaving}>削除</button>
            <div>
              <button type="button" onClick={onClose} disabled={isSaving}>キャンセル</button>
              <button type="submit" disabled={isSaving || !title.trim()}>保存</button>
            </div>
          </footer>
        </form>
      )}
    </dialog>
  )
}
