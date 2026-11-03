import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './components/App.tsx'
import { readChartsInWorker } from './workspace/import/readChartsInWorker.ts'
import { createWorkspace } from './workspace/workspace.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App workspace={createWorkspace({ readCharts: readChartsInWorker() })} />
  </StrictMode>,
)
