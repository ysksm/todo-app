import type { McpDependencies } from '../../di/mcp-dependencies'
import { McpSettings } from '../components/mcp-settings'

interface SettingsPageProps {
  mcpDependencies: McpDependencies
  onBack(): void
}

export function SettingsPage({ mcpDependencies, onBack }: SettingsPageProps) {
  return (
    <main className="todo-page">
      <section className="todo-workspace" aria-labelledby="settings-heading">
        <header className="todo-header">
          <div>
            <p className="todo-header__eyebrow">SETTINGS</p>
            <h1 id="settings-heading">設定</h1>
          </div>
          <button type="button" className="settings-back" onClick={onBack}>
            ← Todo へ戻る
          </button>
        </header>

        <McpSettings dependencies={mcpDependencies} />
      </section>
    </main>
  )
}
