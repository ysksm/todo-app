import type { TodoDependencies } from '../../di/todo-dependencies'
import { TodoForm } from '../components/todo-form'
import { TodoDialog } from '../components/todo-dialog'
import { TodoList } from '../components/todo-list'
import { useTodos } from '../hooks/use-todos'
import '../todo.css'

interface TodoPageProps {
  dependencies: TodoDependencies
}

export function TodoPage({ dependencies }: TodoPageProps) {
  const {
    todos,
    isLoading,
    isSaving,
    error,
    selectedTodo,
    create,
    update,
    remove,
    updateDraft,
    openDialog,
    closeDialog,
  } = useTodos(dependencies)

  const completedCount = todos.filter((todo) => todo.completed).length

  return (
    <main className="todo-page">
      <section className="todo-workspace" aria-labelledby="todo-heading">
        <header className="todo-header">
          <div>
            <p className="todo-header__eyebrow">TASKS</p>
            <h1 id="todo-heading">Todo</h1>
          </div>
          <p className="todo-header__count">{completedCount} / {todos.length} 完了</p>
        </header>

        <TodoForm isSaving={isSaving} onCreate={create} />

        {error && <p className="todo-error" role="alert">{error}</p>}
        {isLoading ? (
          <p className="todo-loading" role="status">読み込み中...</p>
        ) : (
          <TodoList
            todos={todos}
            isSaving={isSaving}
            onUpdate={update}
            onDelete={remove}
            onOpen={openDialog}
          />
        )}
      </section>
      <TodoDialog
        todo={selectedTodo}
        isSaving={isSaving}
        onDraftChange={updateDraft}
        onUpdate={update}
        onDelete={remove}
        onClose={closeDialog}
      />
    </main>
  )
}
