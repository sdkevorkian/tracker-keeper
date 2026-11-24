import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react'
import type { Chart } from '../workspace/chart.ts'
import type { Project } from '../workspace/project.ts'
import {
  listCharts,
  listProjects,
  percentDone,
  suggestCopyTitle,
  whyChartCantBeDeleted,
  type Workspace,
  type WorkspaceState,
} from '../workspace/workspace.ts'
import { ChartLibrary, type ListedChart } from './ChartLibrary.tsx'
import { ChartView } from './ChartView.tsx'
import { DeleteButton } from './DeleteButton.tsx'
import { ImportedBeforeDialog } from './ImportedBeforeDialog.tsx'
import { RenameChartButton } from './RenameChartButton.tsx'
import { chartHref, goTo, projectHref, useRoute, yourChartsHref } from './route.ts'
import { ShortcutHelp } from './ShortcutHelp.tsx'
import { isTextField } from './shortcuts.ts'
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
  const [error, setError] = useState<string>()
  const [importing, setImporting] = useState(false)
  /** A PDF imported before, while the stitcher chooses what to do with it. */
  const [importingAgain, setImportingAgain] = useState<{ bytes: Uint8Array; chartIds: string[] }>()
  const [showingShortcuts, setShowingShortcuts] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // `?` shows the shortcut help from anywhere but a text field, where it's typing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey || isTextField(event.target)) return
      event.preventDefault()
      setShowingShortcuts(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  /** Runs a command, showing why if the Workspace refuses it. */
  function attempt(command: () => void) {
    setError(undefined)
    try {
      command()
    } catch (refused) {
      setError(refused instanceof Error ? refused.message : String(refused))
    }
  }

  function toggleTheme() {
    document.documentElement.dataset.theme = otherTheme
    setTheme(otherTheme)
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(undefined)
    setImporting(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      // Asked about first, so importing the same PDF twice never quietly makes a duplicate.
      const chartIds = await workspace.importedBefore(bytes)
      if (chartIds.length > 0) setImportingAgain({ bytes, chartIds })
      else goTo(chartHref(await workspace.importPdf(bytes)))
    } catch (refused) {
      setError(refused instanceof Error ? refused.message : String(refused))
    } finally {
      setImporting(false)
    }
  }

  /** Imports a separate copy of the PDF imported before. Rejects, for the dialog to show, when the titles are refused. */
  async function importSeparateCopy(bytes: Uint8Array, titles: string[]) {
    setImporting(true)
    try {
      const chartId = await workspace.importPdf(bytes, { titles })
      setImportingAgain(undefined)
      goTo(chartHref(chartId))
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
          <div className="app-header-actions">
            <button type="button" className="button" onClick={() => setShowingShortcuts(true)}>
              Keyboard shortcuts
            </button>
            <button type="button" className="button" onClick={toggleTheme}>
              Switch to {otherTheme} mode
            </button>
          </div>
        </div>
        {showingShortcuts && <ShortcutHelp onClose={() => setShowingShortcuts(false)} />}
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
            Loading chartâ€¦
          </p>
        )}
        {error && (
          <p role="alert" className="import-error">
            {error}
          </p>
        )}
        {importingAgain && (
          <ImportedBeforeDialog
            charts={importingAgain.chartIds.map((id) => state.charts.get(id)!)}
            suggestedTitles={importingAgain.chartIds.map((id) => suggestCopyTitle(state, state.charts.get(id)!.title))}
            onOpen={(chartId) => {
              setImportingAgain(undefined)
              goTo(chartHref(chartId))
            }}
            onCopy={(titles) => importSeparateCopy(importingAgain.bytes, titles)}
            onCancel={() => setImportingAgain(undefined)}
          />
        )}
        {!importing &&
          (route.page === 'chart' ? (
            <ChartPage chart={state.charts.get(route.chartId)} workspace={workspace} attempt={attempt} />
          ) : route.page === 'project' ? (
            <ProjectPage project={state.projects.get(route.projectId)} state={state} workspace={workspace} />
          ) : (
            <ChartLibrary
              charts={listedCharts(state)}
              onRename={(chartId, title) => workspace.renameChart(chartId, title)}
              onDelete={(chartId) => attempt(() => workspace.deleteChart(chartId))}
              onDeleteProject={(projectId) => attempt(() => workspace.deleteProject(projectId))}
            />
          ))}
      </main>
    </>
  )
}

/** One chart's own page. `chart` is undefined when the page's chart isn't stored here. */
function ChartPage({
  chart,
  workspace,
  attempt,
}: {
  chart?: Chart
  workspace: Workspace
  attempt: (command: () => void) => void
}) {
  const chartId = chart?.id
  // The same function while the same chart is open, so its symbols are cut once.
  const sourcePdf = useCallback(() => workspace.sourcePdf(chartId!), [workspace, chartId])
  return (
    <>
      <div className="chart-page-actions">
        <a className="button" href={yourChartsHref}>
          Your charts
        </a>
        {chart && (
          <>
            <button
              type="button"
              className="button button-primary"
              onClick={() => goTo(projectHref(workspace.startProject(chart.id)))}
            >
              Start project
            </button>
            <RenameChartButton chart={chart} onRename={(title) => workspace.renameChart(chart.id, title)} />
            <DeleteButton
              name={chart.title ?? 'Untitled chart'}
              losing="Its corrections"
              refusal={whyChartCantBeDeleted(workspace.state, chart.id)}
              onDelete={() => {
                // Away from its page first, so the page never shows the chart missing.
                goTo(yourChartsHref)
                attempt(() => workspace.deleteChart(chart.id))
              }}
            />
          </>
        )}
      </div>
      {chart ? (
        <ChartView
          key={chart.id}
          viewKey={`chart:${chart.id}`}
          chart={chart}
          sourcePdf={sourcePdf}
          onViewSourcePdf={(page) => openSourcePdf(sourcePdf, page)}
        />
      ) : (
        <p>This chart isn't stored in this browser.</p>
      )}
    </>
  )
}

/** Every chart as Your charts lists it, each with its projects and how far along they are. */
function listedCharts(state: WorkspaceState): ListedChart[] {
  return listCharts(state).map((chart) => ({
    chart,
    projects: listProjects(state, chart.id).map((project) => ({
      id: project.id,
      name: project.name,
      percentDone: percentDone(chart, project),
    })),
    deleteRefusal: whyChartCantBeDeleted(state, chart.id),
  }))
}

/** A project's own page: its chart, to mark stitches on. `project` is undefined when it isn't stored here. */
function ProjectPage({
  project,
  state,
  workspace,
}: {
  project?: Project
  state: WorkspaceState
  workspace: Workspace
}) {
  const chart = project && state.charts.get(project.chartId)
  const projectId = project?.id
  const chartId = chart?.id
  const sourcePdf = useCallback(() => workspace.sourcePdf(chartId!), [workspace, chartId])

  // Undo and redo from anywhere on the page, but not in a text field, which has its own.
  useEffect(() => {
    if (!projectId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || isTextField(event.target)) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) workspace.undo(projectId)
      else if ((key === 'z' && event.shiftKey) || key === 'y') workspace.redo(projectId)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [workspace, projectId])

  if (!project || !chart) return <p>This project isn't stored in this browser.</p>
  return (
    <>
      <div className="chart-page-actions">
        <a className="button" href={yourChartsHref}>
          Your charts
        </a>
        <a className="button" href={chartHref(chart.id)}>
          {chart.title ?? 'Untitled chart'}
        </a>
      </div>
      <div className="project-details">
        <label>
          Project name
          <input
            type="text"
            value={project.name}
            onChange={(event) => workspace.renameProject(project.id, event.target.value)}
          />
        </label>
        <label>
          Fabric color
          <input
            type="color"
            value={project.fabricColor}
            onChange={(event) => workspace.setFabricColor(project.id, event.target.value)}
          />
        </label>
        <label>
          Done color
          <input
            type="color"
            value={project.doneColor}
            onChange={(event) => workspace.setDoneColor(project.id, event.target.value)}
          />
        </label>
        <p className="project-started">Started {new Date(project.startedAt).toLocaleDateString()}</p>
        <p className="percent-done" aria-live="polite">
          {percentDone(chart, project)}% done
        </p>
      </div>
      <div className="chart-toolbar">
        {workspace.canUndo(project.id) && (
          <button type="button" className="button" onClick={() => workspace.undo(project.id)}>
            Undo
          </button>
        )}
        {workspace.canRedo(project.id) && (
          <button type="button" className="button" onClick={() => workspace.redo(project.id)}>
            Redo
          </button>
        )}
      </div>
      <ChartView
        key={project.id}
        viewKey={`project:${project.id}`}
        chart={chart}
        sourcePdf={sourcePdf}
        onViewSourcePdf={(page) => openSourcePdf(sourcePdf, page)}
        marking={{
          fabricColor: project.fabricColor,
          doneColor: project.doneColor,
          progress: project.progress,
          onMark: (cells, done) => workspace.markCells(project.id, cells, done),
        }}
      />
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
