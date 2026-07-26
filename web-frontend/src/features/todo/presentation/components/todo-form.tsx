import { useState, type FormEvent } from 'react'
import {
  TODO_TYPES,
  TODO_TYPE_LABELS,
  defaultChildType,
  type TodoType,
} from '../../domain/entities/todo-type'

interface TodoFormProps {
  isSaving: boolean
  onCreate(title: string, type: TodoType): Promise<boolean>
}

// ここで作るのは必ずルート。ルートにはどの種類でも置ける。
const ROOT_TYPE = defaultChildType(null) ?? 'task'

export function TodoForm({ isSaving, onCreate }: TodoFormProps) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<TodoType>(ROOT_TYPE)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving || !title.trim()) {
      return
    }

    if (await onCreate(title, type)) {
      setTitle('')
    }
  }

  return (
    <form className="todo-form" onSubmit={handleSubmit}>
      <label htmlFor="todo-title">新しい Todo</label>
      <div className="todo-form__controls">
        <select
          id="todo-type"
          className="todo-form__type"
          aria-label="種類"
          value={type}
          onChange={(event) => setType(event.target.value as TodoType)}
          disabled={isSaving}
        >
          {TODO_TYPES.map((todoType) => (
            <option key={todoType} value={todoType}>
              {TODO_TYPE_LABELS[todoType]}
            </option>
          ))}
        </select>
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
