// The headless core: every behavior lives here, behind commands, and the UI
// only sends commands and draws the state it subscribes to.
import type { Chart } from './chart.ts'
import type { ReadCharts } from './import/readCharts.ts'

export interface WorkspaceState {
  charts: ReadonlyMap<string, Chart>
}

export interface Workspace {
  readonly state: WorkspaceState
  /** Calls `listener` after every change. Returns a function that unsubscribes. */
  subscribe(listener: (state: WorkspaceState) => void): () => void
  /** Imports the charts in a PDF and returns the first one's ID. */
  importPdf(bytes: Uint8Array): Promise<string>
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

export function createWorkspace({ readCharts }: WorkspaceOptions): Workspace {
  let state: WorkspaceState = { charts: new Map() }
  const listeners = new Set<(state: WorkspaceState) => void>()

  const update = (next: WorkspaceState) => {
    state = next
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
      return ids[0]
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
