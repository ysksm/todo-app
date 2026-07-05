import { useCallback, useEffect, useState } from "react"
import { ToDoRepositoryImpl } from "./shared/infrastructure/repositories/todo.repository.impl"
import TodoCreate from "./presentation/todo-create"
import TodoList from "./presentation/todo-list"


function App() {
  const [todos, setTodos] = useState<Todo[]>([])

  const loadTodos = useCallback(async () => {
    try {
      const todoRepository = new ToDoRepositoryImpl()
      setTodos(await todoRepository.getTodos())
    } catch (error) {
      console.error('Failed to load todos', error)
    }
  }, [])

  useEffect(() => {
    loadTodos()
  }, [loadTodos])

  return (
    <>
      <TodoCreate onCreated={loadTodos} />
      <TodoList todos={todos} />
    </>
  )
}

export default App
