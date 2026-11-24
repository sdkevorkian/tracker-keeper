// The headless core: every behavior lives here, behind commands, and the UI
// only sends commands and draws the state it subscribes to.
import type { Chart } from './chart.ts'
import type { ReadCharts } from './import/readCharts.ts'
import { DEFAULT_DONE_COLOR, DONE, NOT_DONE, WHITE_FABRIC, type Project } from './project.ts'
import type { EntityTable, IDType } from 'dexie'
import { openStorage, type Database } from './storage.ts'

export interface WorkspaceState {
  charts: ReadonlyMap<string, Chart>
  projects: ReadonlyMap<string, Project>
}

export interface Workspace {
  readonly state: WorkspaceState
  /** Calls `listener` after every change. Returns a function that unsubscribes. */
  subscribe(listener: (state: WorkspaceState) => void): () => void
  /**
   * Imports the charts in a PDF, saves them, and returns the first one's ID. `titles` gives each chart,
   * in the order the PDF prints them, a title of the stitcher's own, as for a separate copy of a PDF imported before.
   */
  importPdf(bytes: Uint8Array, options?: { titles?: readonly string[] }): Promise<string>
  /** The IDs of the charts already imported from this PDF, matched by its SHA-256. Adds nothing. */
  importedBefore(bytes: Uint8Array): Promise<string[]>
  /** Gives a chart the stitcher's own title, replacing any from its source PDF. An empty or blank title is refused. */
  renameChart(chartId: string, title: string): void
  /** Starts a project on a chart, named after it, and returns the project's ID. */
  startProject(chartId: string): string
  /** Gives a project the stitcher's own name. */
  renameProject(projectId: string, name: string): void
  /** Sets the color of a project's fabric, as `#rrggbb`. */
  setFabricColor(projectId: string, color: string): void
  /** Sets the color a project's done stitches are marked in, as `#rrggbb`. */
  setDoneColor(projectId: string, color: string): void
  /** Marks cells of a project done or not done. Blank cells are left as they are. */
  markCells(projectId: string, cells: readonly number[], done: boolean): void
  /** Takes back a project's last mark, if it has one to take back. */
  undo(projectId: string): void
  /** Makes the last mark undone in a project again, if no new mark came since. */
  redo(projectId: string): void
  /** Whether a project has a mark to undo since the app opened. */
  canUndo(projectId: string): boolean
  /** Whether a project has an undone mark to redo. */
  canRedo(projectId: string): boolean
  /** Deletes a project and its progress. It can't be undone. */
  deleteProject(projectId: string): void
  /** Deletes a chart and its corrections. It can't be undone, so a chart with projects is refused. */
  deleteChart(chartId: string): void
  /** The bytes of a chart's source PDF. */
  sourcePdf(chartId: string): Promise<Uint8Array>
  /** Resolves once every change so far is saved. */
  whenSaved(): Promise<void>
}

/** Every chart, in the order the home screen lists them: by title, with untitled charts last. */
export function listCharts({ charts }: WorkspaceState): Chart[] {
  return [...charts.values()].sort((a, b) => {
    if (a.title === undefined || b.title === undefined)
      return Number(a.title === undefined) - Number(b.title === undefined)
    return a.title.localeCompare(b.title)
  })
}

/** A chart's projects, oldest first. */
export function listProjects({ projects }: WorkspaceState, chartId: string): Project[] {
  return [...projects.values()]
    .filter((project) => project.chartId === chartId)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

/** A title for a separate copy of a chart titled `title`: that title numbered from 2, so no chart already has it. */
export function suggestCopyTitle({ charts }: WorkspaceState, title: string | undefined) {
  const taken = new Set([...charts.values()].map((chart) => chart.title))
  const base = title ?? 'Untitled chart'
  let n = 2
  while (taken.has(`${base} (${n})`)) n++
  return `${base} (${n})`
}

/** Why deleting a chart would be refused, or undefined when it can be deleted. A chart with projects can't be, so no progress is lost. */
export function whyChartCantBeDeleted(state: WorkspaceState, chartId: string) {
  const projects = listProjects(state, chartId).length
  if (projects === 0) return undefined
  return `This chart has ${projects} ${projects === 1 ? 'project' : 'projects'}. Delete ${projects === 1 ? 'it' : 'them'} first.`
}

/** How much of the chart's stitches are done, in whole percent rounded down, so 100 means every one. Blank cells don't count. */
export function percentDone(chart: Chart, project: Project) {
  let stitches = 0
  let done = 0
  chart.cells.forEach((entry, cell) => {
    if (entry === 0) return
    stitches++
    if (project.progress[cell] === DONE) done++
  })
  return stitches === 0 ? 0 : Math.floor((done * 100) / stitches)
}

/** Far larger than any chart PDF, but small enough that reading one can't exhaust memory. */
const MAX_PDF_MB = 200

/** Reading a chart takes seconds; a PDF still being read after this is stopped. */
const READ_TIMEOUT_MS = 60_000

export interface WorkspaceOptions {
  /**
   * How import reads charts out of a PDF: in a Web Worker in the app, in-process in tests.
   * Passed in, so the app doesn't bundle pdf.js on the main thread.
   */
  readCharts: ReadCharts
}

export interface StoredWorkspaceOptions extends WorkspaceOptions {
  /** The IndexedDB the Workspace loads from and saves every change to. */
  database: Database
}

/** Opens the Workspace saved in `database`, which then saves every change back to it. */
export async function openWorkspace({ database, ...options }: StoredWorkspaceOptions): Promise<Workspace> {
  const storage = await openStorage(database)
  const charts = new Map((await storage.charts.toArray()).map((chart) => [chart.id, chart]))
  const projects = new Map((await storage.projects.toArray()).map((project) => [project.id, project]))
  return createWorkspace(options, {
    state: { charts, projects },
    save: (before, after) =>
      storage.transaction('rw', storage.charts, storage.projects, async () => {
        await saveChanges(storage.charts, before.charts, after.charts)
        await saveChanges(storage.projects, before.projects, after.projects)
      }),
    addSourcePdf: async (pdfSha256, bytes) => {
      await storage.sourcePdfs.put({ sha256: pdfSha256, bytes })
    },
    removeSourcePdf: async (pdfSha256) => {
      await storage.sourcePdfs.delete(pdfSha256)
    },
    sourcePdf: async (pdfSha256) => (await storage.sourcePdfs.get(pdfSha256))?.bytes,
  })
}

/** Saves the records that changed between two states of one kind of record, and deletes those removed. */
async function saveChanges<T extends { id: string }>(
  table: EntityTable<T, 'id'>,
  before: ReadonlyMap<string, T>,
  after: ReadonlyMap<string, T>,
) {
  await table.bulkPut([...after.values()].filter((record) => before.get(record.id) !== record))
  await table.bulkDelete([...before.keys()].filter((id) => !after.has(id)) as IDType<T, 'id'>[])
}

/** Where a Workspace keeps its state and source PDFs. */
interface Store {
  state: WorkspaceState
  /** Saves the difference between two states. */
  save(before: WorkspaceState, after: WorkspaceState): Promise<void>
  /** Keeps a source PDF, once however many charts come from it. */
  addSourcePdf(pdfSha256: string, bytes: Uint8Array): Promise<void>
  removeSourcePdf(pdfSha256: string): Promise<void>
  sourcePdf(pdfSha256: string): Promise<Uint8Array | undefined>
}

/** A store that keeps everything in memory, so nothing outlives the Workspace. */
function memoryStore(): Store {
  const sourcePdfs = new Map<string, Uint8Array>()
  return {
    state: { charts: new Map(), projects: new Map() },
    save: async () => {},
    addSourcePdf: async (pdfSha256, bytes) => {
      sourcePdfs.set(pdfSha256, bytes)
    },
    removeSourcePdf: async (pdfSha256) => {
      sourcePdfs.delete(pdfSha256)
    },
    sourcePdf: async (pdfSha256) => sourcePdfs.get(pdfSha256),
  }
}

/** One mark, as the cells it changed and their states before and after. */
interface Mark {
  cells: number[]
  before: number[]
  after: number[]
}

/** A project's marks that can be undone, most recent last, and those undone that can be redone. */
interface History {
  undo: Mark[]
  redo: Mark[]
}

/** A Workspace. Without `store` it starts empty and keeps nothing once it's gone. */
export function createWorkspace({ readCharts }: WorkspaceOptions, store: Store = memoryStore()): Workspace {
  let state = store.state
  const listeners = new Set<(state: WorkspaceState) => void>()
  let saved = Promise.resolve()
  // Kept only while the app is open: a reload starts every project with nothing to undo.
  const histories = new Map<string, History>()
  const historyOf = (projectId: string) => {
    let history = histories.get(projectId)
    if (!history) histories.set(projectId, (history = { undo: [], redo: [] }))
    return history
  }
  /** Sets each of the mark's cells to its state `when`, and returns the project. */
  const applyMark = (project: Project, mark: Mark, when: 'before' | 'after') => {
    const progress = project.progress.slice()
    mark.cells.forEach((cell, i) => (progress[cell] = mark[when][i]))
    update({ ...state, projects: new Map(state.projects).set(project.id, { ...project, progress }) })
  }
  const projectOf = (projectId: string) => {
    const project = state.projects.get(projectId)
    if (!project) throw new Error('No such project')
    return project
  }
  /** Saves are made one after another, in the order of the changes. */
  const queue = (save: () => Promise<void>) => (saved = saved.then(save))

  // Every command changes state through here, so every change is saved without code of its own.
  const update = (next: WorkspaceState) => {
    const before = state
    state = next
    queue(() => store.save(before, next))
    for (const listener of listeners) listener(state)
  }

  return {
    get state() {
      return state
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async importPdf(bytes, { titles = [] } = {}) {
      if (titles.some(isBlank)) throw new Error(EMPTY_TITLE)
      if (!isPdf(bytes)) throw new Error("This file isn't a PDF")
      if (bytes.length > MAX_PDF_MB * 1024 * 1024) {
        throw new Error(`This PDF is too large to import (over ${MAX_PDF_MB} MB)`)
      }
      const parsed = await readWithTimeout(readCharts, bytes)
      if (parsed.length === 0) throw new Error('No chart found in this PDF')
      const pdfSha256 = await sha256(bytes)
      // Before the charts, so a saved chart's source PDF is always there.
      queue(() => store.addSourcePdf(pdfSha256, bytes.slice()))
      const charts = new Map(state.charts)
      const ids = parsed.map(({ sourcePages, ...chart }, i) => {
        const id = crypto.randomUUID()
        charts.set(id, {
          id,
          ...chart,
          title: titles[i] ?? chart.title,
          source: { pdfSha256, pages: sourcePages },
        })
        return id
      })
      update({ ...state, charts })
      // An import is done once it's stored, so closing the app straight after keeps it.
      await saved
      return ids[0]
    },
    async importedBefore(bytes) {
      const pdfSha256 = await sha256(bytes)
      return [...state.charts.values()].filter((chart) => chart.source.pdfSha256 === pdfSha256).map(({ id }) => id)
    },
    renameChart(chartId, title) {
      const chart = state.charts.get(chartId)
      if (!chart) throw new Error('No such chart')
      if (isBlank(title)) throw new Error(EMPTY_TITLE)
      update({ ...state, charts: new Map(state.charts).set(chartId, { ...chart, title }) })
    },
    startProject(chartId) {
      const chart = state.charts.get(chartId)
      if (!chart) throw new Error('No such chart')
      const id = crypto.randomUUID()
      const project: Project = {
        id,
        chartId,
        name: chart.title ?? 'Untitled chart',
        startedAt: new Date().toISOString(),
        fabricColor: WHITE_FABRIC,
        doneColor: DEFAULT_DONE_COLOR,
        progress: new Uint8Array(chart.cells.length).fill(NOT_DONE),
      }
      update({ ...state, projects: new Map(state.projects).set(id, project) })
      return id
    },
    renameProject(projectId, name) {
      const project = projectOf(projectId)
      update({ ...state, projects: new Map(state.projects).set(projectId, { ...project, name }) })
    },
    setFabricColor(projectId, fabricColor) {
      const project = projectOf(projectId)
      update({ ...state, projects: new Map(state.projects).set(projectId, { ...project, fabricColor }) })
    },
    setDoneColor(projectId, doneColor) {
      const project = projectOf(projectId)
      update({ ...state, projects: new Map(state.projects).set(projectId, { ...project, doneColor }) })
    },
    markCells(projectId, cells, done) {
      const project = projectOf(projectId)
      const chart = state.charts.get(project.chartId)!
      const to = done ? DONE : NOT_DONE
      const changed = [...new Set(cells)].filter((cell) => chart.cells[cell] !== 0 && project.progress[cell] !== to)
      // Nothing to undo, and nothing that should clear what can be redone.
      if (changed.length === 0) return
      const mark = {
        cells: changed,
        before: changed.map((cell) => project.progress[cell]),
        after: changed.map(() => to),
      }
      const history = historyOf(projectId)
      history.undo.push(mark)
      history.redo = []
      applyMark(project, mark, 'after')
    },
    undo(projectId) {
      const project = projectOf(projectId)
      const history = historyOf(projectId)
      const mark = history.undo.pop()
      if (!mark) return
      history.redo.push(mark)
      applyMark(project, mark, 'before')
    },
    redo(projectId) {
      const project = projectOf(projectId)
      const history = historyOf(projectId)
      const mark = history.redo.pop()
      if (!mark) return
      history.undo.push(mark)
      applyMark(project, mark, 'after')
    },
    canUndo(projectId) {
      return (histories.get(projectId)?.undo.length ?? 0) > 0
    },
    canRedo(projectId) {
      return (histories.get(projectId)?.redo.length ?? 0) > 0
    },
    deleteProject(projectId) {
      projectOf(projectId)
      const projects = new Map(state.projects)
      projects.delete(projectId)
      histories.delete(projectId)
      update({ ...state, projects })
    },
    deleteChart(chartId) {
      const chart = state.charts.get(chartId)
      if (!chart) throw new Error('No such chart')
      const refusal = whyChartCantBeDeleted(state, chartId)
      if (refusal) throw new Error(refusal)
      const charts = new Map(state.charts)
      charts.delete(chartId)
      update({ ...state, charts })
      // After the chart, so a saved chart's source PDF is always there.
      const { pdfSha256 } = chart.source
      const stillUsed = [...charts.values()].some((other) => other.source.pdfSha256 === pdfSha256)
      if (!stillUsed) queue(() => store.removeSourcePdf(pdfSha256))
    },
    async sourcePdf(chartId) {
      const chart = state.charts.get(chartId)
      if (!chart) throw new Error('No such chart')
      const bytes = await store.sourcePdf(chart.source.pdfSha256)
      if (!bytes) throw new Error("This chart's source PDF isn't stored")
      return bytes
    },
    whenSaved() {
      return saved
    },
  }
}

const EMPTY_TITLE = "A chart's title can't be empty"

function isBlank(title: string) {
  return title.trim() === ''
}

// PDF readers accept the header anywhere in the first 1024 bytes.
function isPdf(bytes: Uint8Array) {
  const start = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  return start.includes('%PDF-')
}

async function sha256(bytes: Uint8Array) {
  // A copy, since the bytes may sit on a SharedArrayBuffer, which digest refuses.
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice()))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function readWithTimeout(readCharts: ReadCharts, bytes: Uint8Array) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error('This PDF took too long to read'))
    }, READ_TIMEOUT_MS)
  })
  try {
    return await Promise.race([readCharts(bytes, controller.signal), timedOut])
  } finally {
    clearTimeout(timer)
  }
}
