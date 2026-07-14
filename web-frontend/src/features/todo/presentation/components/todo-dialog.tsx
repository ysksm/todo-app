import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Todo } from '../../domain/entities/todo'

interface TodoDialogProps {
  todo: Todo | null
  isSaving: boolean
  onDraftChange(todo: Todo): void
  onUpdate(todo: Todo): Promise<boolean>
  onDelete(id: number): Promise<boolean>
  onClose(): void
}

export function TodoDialog({ todo, isSaving, onDraftChange, onUpdate, onDelete, onClose }: TodoDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [completed, setCompleted] = useState(false)

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
    }
  }, [todo])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!todo || isSaving || !title.trim()) {
      return
    }

    if (await onUpdate({ ...todo, title, description, completed })) {
      onClose()
    }
  }

  function commitDraft() {
    if (todo) {
      onDraftChange({ ...todo, title, description, completed })
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
