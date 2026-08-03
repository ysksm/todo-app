import type { McpDependencies } from '@/features/mcp/di/mcp-dependencies'
import { McpPanel } from '@/features/mcp/presentation/components/mcp-panel'
import type { TodoDependencies } from '../../di/todo-dependencies'
import {
  TODO_STATUSES,
  TODO_STATUS_LABELS,
  type TodoStatus,
} from '../../domain/entities/todo-status'
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

const STATUS_FILTERS: readonly { status: TodoStatus | null; label: string }[] = [
  { status: null, label: 'すべて' },
  ...TODO_STATUSES.map((status) => ({ status, label: TODO_STATUS_LABELS[status] })),
]

export function TodoPage({ dependencies, mcpDependencies }: TodoPageProps) {
  const {
    todos,
    isLoading,
    isSaving,
    error,
    selectedTodo,
    viewMode,
    statusFilter,
    create,
    createTodo,
    update,
    move,
    remove,
    updateDraft,
    openDialog,
    closeDialog,
    changeViewMode,
    changeStatusFilter,
  } = useTodos(dependencies)

  const doneCount = todos.filter((todo) => todo.status === 'done').length
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
          <p className="todo-header__count">{doneCount} / {todos.length} 完了</p>
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

        {!isMindmap && (
          <div className="todo-filter" role="group" aria-label="状態で絞り込み">
            <span className="todo-filter__label">状態:</span>
            {STATUS_FILTERS.map(({ status, label }) => (
              <button
                key={status ?? 'all'}
                type="button"
                aria-pressed={statusFilter === status}
                className={`todo-filter__chip${statusFilter === status ? ' todo-filter__chip--active' : ''}`}
                onClick={() => changeStatusFilter(status)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

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
            statusFilter={statusFilter}
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
