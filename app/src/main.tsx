import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './components/App.tsx'
import { readChartsInWorker } from './workspace/import/readChartsInWorker.ts'
import { openWorkspace, type Workspace } from './workspace/workspace.ts'

const root = createRoot(document.getElementById('root')!)

// Makes the browser less likely to clear stored charts when space runs low.
void navigator.storage?.persist?.()

/** Marks the page `data-saving` while changes are still being saved, so leaving it can wait until they are. */
function showSaving(workspace: Workspace) {
  /** Waits until no save is left, including those queued while waiting, such as a source PDF's after its chart. */
  const settle = async () => {
    let saved
    do {
      saved = workspace.whenSaved()
      await saved.catch(() => {})
    } while (workspace.whenSaved() !== saved)
    // In the same step as the last check, so no change can slip in between.
    settling = undefined
    delete document.documentElement.dataset.saving
  }
  let settling: Promise<void> | undefined
  workspace.subscribe(() => {
    document.documentElement.dataset.saving = ''
    settling ??= settle()
  })
}

openWorkspace({ readCharts: readChartsInWorker(), database: { indexedDB, IDBKeyRange } }).then(
  (workspace) => {
    showSaving(workspace)
    root.render(
      <StrictMode>
        <App workspace={workspace} />
      </StrictMode>,
    )
  },
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
