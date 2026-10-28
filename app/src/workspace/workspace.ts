// The headless core: every behavior lives here, behind commands, and the UI
// only sends commands and draws the state it subscribes to.
import type { Chart } from './chart.ts'
import { extractPages } from './import/extract.ts'
import { parseCharts } from './import/parse.ts'

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

export function createWorkspace(): Workspace {
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
      const parsed = parseCharts(await extractPages(bytes))
      if (parsed.length === 0) throw new Error('No chart found in this PDF')
      const charts = new Map(state.charts)
      const ids = parsed.map((chart) => {
        const id = crypto.randomUUID()
        charts.set(id, { id, ...chart })
        return id
      })
      update({ ...state, charts })
      return ids[0]
    },
  }
}
