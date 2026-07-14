import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { createAppDependencies } from '@/app/di/create-app-dependencies'
import { createAppStore } from '@/app/store/create-app-store'
import './index.css'
import App from './App.tsx'

const dependencies = createAppDependencies()
const store = createAppStore()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App dependencies={dependencies} />
    </Provider>
  </StrictMode>,
)
