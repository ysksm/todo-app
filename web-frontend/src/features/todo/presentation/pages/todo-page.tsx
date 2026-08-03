import type { McpDependencies } from '@/features/mcp/di/mcp-dependencies'
import { McpPanel } from '@/features/mcp/presentation/components/mcp-panel'
import type { TodoDependencies } from '../../di/todo-dependencies'
import {
  TODO_STATUSES,
  TODO_STATUS_LABELS,
  type TodoStatus,
} from '../../domain/entities/todo-status'
import { TODO_TYPES, TODO_TYPE_LABELS, type TodoType } from '../../domain/entities/todo-type'
import type { TodoViewMode } from '../store/todo-slice'
import { KanbanView } from '../components/kanban/kanban-view'
import { MindmapView } from '../components/mindmap/mindmap-view'
import { TodoForm } from '../components/todo-form'
import { TodoDialog } from '../components/todo-dialog'
import { TodoList } from '../components/todo-list'
import { useTodos } from '../hooks/use-todos'
import '../todo.css'
import '../kanban.css'
import '../mindmap.css'

interface TodoPageProps {
  dependencies: TodoDependencies
  mcpDependencies: McpDependencies
}

const VIEW_MODES: readonly { mode: TodoViewMode; label: string }[] = [
  { mode: 'list', label: 'リスト' },
  { mode: 'kanban', label: 'カンバン' },
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
    typeFilter,
    searchQuery,
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
    changeTypeFilter,
    changeSearchQuery,
  } = useTodos(dependencies)

  const doneCount = todos.filter((todo) => todo.status === 'done').length
  const isMindmap = viewMode === 'mindmap'
  const isWide = viewMode === 'mindmap' || viewMode === 'kanban'

  return (
    <main className="todo-page">
      <section
        className={`todo-workspace${isWide ? ' todo-workspace--wide' : ''}`}
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
          <div className="todo-filter" role="group" aria-label="絞り込み">
            {viewMode === 'list' && (
              <div className="todo-filter__group">
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
            <div className="todo-filter__group">
              <label className="todo-filter__label" htmlFor="todo-filter-type">種別:</label>
              <select
                id="todo-filter-type"
                className="todo-filter__select"
                value={typeFilter ?? ''}
                onChange={(event) =>
                  changeTypeFilter(
                    event.target.value === '' ? null : (event.target.value as TodoType),
                  )
                }
              >
                <option value="">すべて</option>
                {TODO_TYPES.map((todoType) => (
                  <option key={todoType} value={todoType}>
                    {TODO_TYPE_LABELS[todoType]}
                  </option>
                ))}
              </select>
            </div>
            <div className="todo-filter__group todo-filter__group--search">
              <input
                type="search"
                className="todo-filter__search"
                value={searchQuery}
                placeholder="タイトル・詳細を検索"
                aria-label="タイトル・詳細を検索"
                onChange={(event) => changeSearchQuery(event.target.value)}
              />
            </div>
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
        ) : viewMode === 'kanban' ? (
          <KanbanView
            todos={todos}
            filter={{ status: null, type: typeFilter, query: searchQuery }}
            isSaving={isSaving}
            onUpdate={update}
            onOpen={openDialog}
          />
        ) : (
          <TodoList
            todos={todos}
            filter={{ status: statusFilter, type: typeFilter, query: searchQuery }}
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
