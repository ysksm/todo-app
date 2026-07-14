import type { AppDependencies } from '@/app/di/app-dependencies'
import { TodoPage } from '@/features/todo/presentation/pages/todo-page'

interface AppProps {
  dependencies: AppDependencies
}

function App({ dependencies }: AppProps) {
  return <TodoPage dependencies={dependencies.todo} />
}

export default App
