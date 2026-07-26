import type { McpDependencies } from '@/features/mcp/di/mcp-dependencies'
import { McpPanel } from '@/features/mcp/presentation/components/mcp-panel'
import type { TodoDependencies } from '../../di/todo-dependencies'
import type { TodoViewMode } from '../store/todo-slice'
import { MindmapView } from '../components/mindmap/mindmap-view'
import { TodoForm } from '../components/todo-form'
import { TodoDialog } from '../components/todo-dialog'
import { TodoList } from '../components/todo-list'
import { useTodos } from '../hooks/use-todos'
import '../todo.css'
import '../mindmap.css'

interface TodoPageProps {
  dependencies: TodoDependencies
  mcpDependencies: McpDependencies
}

const VIEW_MODES: readonly { mode: TodoViewMode; label: string }[] = [
  { mode: 'list', label: 'リスト' },
  { mode: 'mindmap', label: 'マインドマップ' },
]

export function TodoPage({ dependencies, mcpDependencies }: TodoPageProps) {
  const {
    todos,
    isLoading,
    isSaving,
    error,
    selectedTodo,
    viewMode,
    create,
    createTodo,
    update,
    move,
    remove,
    updateDraft,
    openDialog,
    closeDialog,
    changeViewMode,
  } = useTodos(dependencies)

  const completedCount = todos.filter((todo) => todo.completed).length
  const isMindmap = viewMode === 'mindmap'

  return (
    <main className="todo-page">
      <section
        className={`todo-workspace${isMindmap ? ' todo-workspace--wide' : ''}`}
        aria-labelledby="todo-heading"
      >
        <header className="todo-header">
          <div>
            <p className="todo-header__eyebrow">TASKS</p>
            <h1 id="todo-heading">Todo</h1>
          </div>
          <p className="todo-header__count">{completedCount} / {todos.length} 完了</p>
        </header>

        <div className="todo-view-switch" role="tablist" aria-label="表示の切り替え">
          {VIEW_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={viewMode === mode}
              className={`todo-view-switch__tab${viewMode === mode ? ' todo-view-switch__tab--active' : ''}`}
              onClick={() => changeViewMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>

        {!isMindmap && <TodoForm isSaving={isSaving} onCreate={create} />}

        {error && <p className="todo-error" role="alert">{error}</p>}
        {isLoading ? (
          <p className="todo-loading" role="status">読み込み中...</p>
        ) : isMindmap ? (
          <MindmapView
            todos={todos}
            isSaving={isSaving}
            onCreate={createTodo}
            onUpdate={update}
            onMove={move}
            onDelete={remove}
          />
        ) : (
          <TodoList
            todos={todos}
            isSaving={isSaving}
            onUpdate={update}
            onDelete={remove}
            onOpen={openDialog}
          />
        )}

        <McpPanel dependencies={mcpDependencies} />
      </section>
      <TodoDialog
        todo={selectedTodo}
        todos={todos}
        isSaving={isSaving}
        onDraftChange={updateDraft}
        onUpdate={update}
        onDelete={remove}
        onClose={closeDialog}
      />
    </main>
  )
}
