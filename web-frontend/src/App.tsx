import { useState } from 'react'
import type { AppDependencies } from '@/app/di/app-dependencies'
import { SettingsPage } from '@/features/mcp/presentation/pages/settings-page'
import { TodoPage } from '@/features/todo/presentation/pages/todo-page'

interface AppProps {
  dependencies: AppDependencies
}

function App({ dependencies }: AppProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  if (isSettingsOpen) {
    return (
      <SettingsPage
        mcpDependencies={dependencies.mcp}
        onBack={() => setIsSettingsOpen(false)}
      />
    )
  }

  return (
    <TodoPage dependencies={dependencies.todo} onOpenSettings={() => setIsSettingsOpen(true)} />
  )
}

export default App
