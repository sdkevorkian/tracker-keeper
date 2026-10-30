// A protocol driver: one way of reaching the app. The DSL talks only to this
// interface, so the same cases run against the Workspace and the browser.

/** What a driver can do. A case that needs a capability its driver lacks is skipped. */
export type Capability = 'import' | 'responsiveness' | 'pan and zoom'

/** Stitches the stitcher can see, numbered from 1 like a printed chart's margins. Ends are inclusive. */
export interface ShownStitches {
  across: [first: number, last: number]
  down: [first: number, last: number]
}

export interface Driver {
  readonly name: string
  readonly capabilities: ReadonlySet<Capability>
  importPdf(bytes: Uint8Array): Promise<void>
  /** The size of the chart the stitcher is looking at, in stitches. */
  shownChartSize(): Promise<{ width: number; height: number }>
  /** The longest the page was blocked during the last import, in milliseconds. */
  longestBlockDuringImport(): Promise<number>
  shownStitches(): Promise<ShownStitches>
  zoomIn(): Promise<void>
  /** Drags the chart left, which brings stitches from its right into view. */
  dragChartLeft(): Promise<void>
}
