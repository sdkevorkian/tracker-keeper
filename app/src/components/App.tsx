import { useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react'
import type { Workspace } from '../workspace/workspace.ts'
import { ChartView } from './ChartView.tsx'
import './App.css'

type UserAgentData = { brands: { brand: string }[] }

type Theme = 'light' | 'dark'

// Chrome and Edge both report the "Chromium" brand; Firefox and Safari have no userAgentData.
function isSupportedBrowser(): boolean {
  const { userAgentData } = navigator as Navigator & { userAgentData?: UserAgentData }
  return userAgentData?.brands.some(({ brand }) => brand === 'Chromium') ?? false
}

function preferredTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function App({ workspace }: { workspace: Workspace }) {
  const [theme, setTheme] = useState<Theme>(preferredTheme)
  const otherTheme = theme === 'dark' ? 'light' : 'dark'
  const state = useSyncExternalStore(workspace.subscribe, () => workspace.state)
  const [chartId, setChartId] = useState<string>()
  const [importError, setImportError] = useState<string>()
  const fileInput = useRef<HTMLInputElement>(null)
  const chart = chartId ? state.charts.get(chartId) : undefined

  function toggleTheme() {
    document.documentElement.dataset.theme = otherTheme
    setTheme(otherTheme)
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImportError(undefined)
    try {
      setChartId(await workspace.importPdf(new Uint8Array(await file.arrayBuffer())))
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <>
      {!isSupportedBrowser() && (
        <p role="alert" className="browser-notice">
          tracker-keeper only works in Chrome and Edge. Please use Chrome or Edge to open it.
        </p>
      )}
      <main>
        <div className="app-header">
          <h1>tracker-keeper</h1>
          <button type="button" className="button" onClick={toggleTheme}>
            Switch to {otherTheme} mode
          </button>
        </div>
        <p>Import, verify and track cross stitch charts in the browser.</p>
        <button type="button" className="button" onClick={() => fileInput.current?.click()}>
          Import
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          aria-label="Chart PDF"
          hidden
          onChange={importFile}
        />
        {importError && (
          <p role="alert" className="import-error">
            {importError}
          </p>
        )}
        {chart && <ChartView key={chart.id} chart={chart} />}
      </main>
    </>
  )
}

export default App
