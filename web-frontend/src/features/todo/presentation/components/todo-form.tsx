import { useState, type FormEvent } from 'react'

interface TodoFormProps {
  isSaving: boolean
  onCreate(title: string): Promise<boolean>
}

export function TodoForm({ isSaving, onCreate }: TodoFormProps) {
  const [title, setTitle] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving || !title.trim()) {
      return
    }

    if (await onCreate(title)) {
      setTitle('')
    }
  }

  return (
    <form className="todo-form" onSubmit={handleSubmit}>
      <label htmlFor="todo-title">新しい Todo</label>
      <div className="todo-form__controls">
        <input
          id="todo-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="やることを入力"
          disabled={isSaving}
        />
        <button type="submit" disabled={isSaving || !title.trim()}>
          追加
        </button>
      </div>
    </form>
  )
}
