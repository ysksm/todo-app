import { useState } from 'react'
import { ToDoRepositoryImpl } from '../shared/infrastructure/repositories/todo.repository.impl'

type TodoCreateProps = {
  onCreated: () => void
}

function TodoCreate({ onCreated }: TodoCreateProps) {
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || submitting) return

    setSubmitting(true)
    setError(null)
    try {
      const todoRepository = new ToDoRepositoryImpl()
      await todoRepository.addTodo({ title: trimmed, description: '', completed: false })
      setTitle('')
      onCreated()
    } catch {
      setError('Failed to add todo')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1>Todo Create</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Enter todo title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" disabled={submitting}>Add Todo</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}


export default TodoCreate
