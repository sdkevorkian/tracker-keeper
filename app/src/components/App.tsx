import { useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react'
import type { Chart } from '../workspace/chart.ts'
import { listCharts, type Workspace } from '../workspace/workspace.ts'
import { ChartLibrary } from './ChartLibrary.tsx'
import { ChartView } from './ChartView.tsx'
import { chartHref, goTo, useRoute, yourChartsHref } from './route.ts'
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
  const route = useRoute()
  const [importError, setImportError] = useState<string>()
  const [importing, setImporting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function toggleTheme() {
    document.documentElement.dataset.theme = otherTheme
    setTheme(otherTheme)
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImportError(undefined)
    setImporting(true)
    try {
      goTo(chartHref(await workspace.importPdf(new Uint8Array(await file.arrayBuffer()))))
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error))
    } finally {
      setImporting(false)
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
        <button type="button" className="button button-primary" onClick={() => fileInput.current?.click()}>
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
        {importing && (
          <p role="status" className="import-status">
            <span className="spinner" aria-hidden="true" />
            Loading chart…
          </p>
        )}
        {importError && (
          <p role="alert" className="import-error">
            {importError}
          </p>
        )}
        {!importing &&
          (route.page === 'chart' ? (
            <ChartPage chart={state.charts.get(route.chartId)} workspace={workspace} />
          ) : (
            <ChartLibrary charts={listCharts(state)} />
          ))}
      </main>
    </>
  )
}

/** One chart's own page. `chart` is undefined when the page's chart isn't stored here. */
function ChartPage({ chart, workspace }: { chart?: Chart; workspace: Workspace }) {
  return (
    <>
      <a className="button back-to-library" href={yourChartsHref}>
        Your charts
      </a>
      {chart ? (
        <ChartView
          key={chart.id}
          chart={chart}
          onViewSourcePdf={(page) => openSourcePdf(() => workspace.sourcePdf(chart.id), page)}
        />
      ) : (
        <p>This chart isn't stored in this browser.</p>
      )}
    </>
  )
}

/** How long an opened source PDF's URL is kept before it's revoked; the tab has loaded it well before then. */
const SOURCE_PDF_URL_LIFETIME_MS = 60_000

/**
 * Opens the source PDF in a new tab, in the browser's own PDF viewer, at `page`.
 * The tab opens at once, inside the click, so popup blockers allow it; the PDF follows once it's read.
 */
function openSourcePdf(sourcePdf: () => Promise<Uint8Array>, page: number | undefined) {
  const tab = window.open('', '_blank')
  if (!tab) return
  tab.opener = null
  sourcePdf().then(
    (bytes) => {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
      tab.location.href = page === undefined ? url : `${url}#page=${page}`
      setTimeout(() => URL.revokeObjectURL(url), SOURCE_PDF_URL_LIFETIME_MS)
    },
    () => tab.close(),
  )
}

export default App
