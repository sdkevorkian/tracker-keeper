import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './components/App.tsx'
import { readChartsInWorker } from './workspace/import/readChartsInWorker.ts'
import { openWorkspace } from './workspace/workspace.ts'

const root = createRoot(document.getElementById('root')!)

// Makes the browser less likely to clear stored charts when space runs low.
void navigator.storage?.persist?.()

openWorkspace({ readCharts: readChartsInWorker(), database: { indexedDB, IDBKeyRange } }).then(
  (workspace) =>
    root.render(
      <StrictMode>
        <App workspace={workspace} />
      </StrictMode>,
    ),
  (error: unknown) =>
    root.render(
      <main>
        <h1>tracker-keeper</h1>
        <p role="alert" className="import-error">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </main>,
    ),
)
