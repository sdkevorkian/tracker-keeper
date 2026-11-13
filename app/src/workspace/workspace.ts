// The headless core: every behavior lives here, behind commands, and the UI
// only sends commands and draws the state it subscribes to.
import type { Chart } from './chart.ts'
import type { ReadCharts } from './import/readCharts.ts'
import { openStorage, type Database } from './storage.ts'

export interface WorkspaceState {
  charts: ReadonlyMap<string, Chart>
}

export interface Workspace {
  readonly state: WorkspaceState
  /** Calls `listener` after every change. Returns a function that unsubscribes. */
  subscribe(listener: (state: WorkspaceState) => void): () => void
  /** Imports the charts in a PDF, saves them, and returns the first one's ID. */
  importPdf(bytes: Uint8Array): Promise<string>
  /** Gives a chart the stitcher's own title, replacing any from its source PDF. */
  renameChart(chartId: string, title: string): void
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
  return createWorkspace(options, {
    state: { charts },
    save: (before, after) =>
      storage.transaction('rw', storage.charts, async () => {
        const changed = [...after.charts.values()].filter((chart) => before.charts.get(chart.id) !== chart)
        await storage.charts.bulkPut(changed)
      }),
    addSourcePdf: async (pdfSha256, bytes) => {
      await storage.sourcePdfs.put({ sha256: pdfSha256, bytes })
    },
    sourcePdf: async (pdfSha256) => (await storage.sourcePdfs.get(pdfSha256))?.bytes,
  })
}

/** Where a Workspace keeps its state and source PDFs. */
interface Store {
  state: WorkspaceState
  /** Saves the difference between two states. */
  save(before: WorkspaceState, after: WorkspaceState): Promise<void>
  /** Keeps a source PDF, once however many charts come from it. */
  addSourcePdf(pdfSha256: string, bytes: Uint8Array): Promise<void>
  sourcePdf(pdfSha256: string): Promise<Uint8Array | undefined>
}

/** A store that keeps everything in memory, so nothing outlives the Workspace. */
function memoryStore(): Store {
  const sourcePdfs = new Map<string, Uint8Array>()
  return {
    state: { charts: new Map() },
    save: async () => {},
    addSourcePdf: async (pdfSha256, bytes) => {
      sourcePdfs.set(pdfSha256, bytes)
    },
    sourcePdf: async (pdfSha256) => sourcePdfs.get(pdfSha256),
  }
}

/** A Workspace. Without `store` it starts empty and keeps nothing once it's gone. */
export function createWorkspace({ readCharts }: WorkspaceOptions, store: Store = memoryStore()): Workspace {
  let state = store.state
  const listeners = new Set<(state: WorkspaceState) => void>()
  let saved = Promise.resolve()
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
    async importPdf(bytes) {
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
      const ids = parsed.map(({ sourcePages, ...chart }) => {
        const id = crypto.randomUUID()
        charts.set(id, {
          id,
          ...chart,
          source: { pdfSha256, pages: sourcePages },
        })
        return id
      })
      update({ ...state, charts })
      // An import is done once it's stored, so closing the app straight after keeps it.
      await saved
      return ids[0]
    },
    renameChart(chartId, title) {
      const chart = state.charts.get(chartId)
      if (!chart) throw new Error('No such chart')
      update({ ...state, charts: new Map(state.charts).set(chartId, { ...chart, title }) })
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
