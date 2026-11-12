// A protocol driver: one way of reaching the app. The DSL talks only to this
// interface, so the same cases run against the Workspace and the browser.

/** What a driver can do. A case that needs a capability its driver lacks is skipped. */
export type Capability =
  | 'import'
  | 'responsiveness'
  | 'pan and zoom'
  | 'source pages'
  | 'import issues'
  /** Reading every chart the last import gave, not only the one on screen. */
  | 'every chart'
  /** Reading the legend entries of the chart on screen. */
  | 'legend'
  /** Reading the title of the chart on screen. */
  | 'chart title'
  /** Closing the app and opening it again, keeping what the browser stored. */
  | 'reload'
  /** Listing the stored charts on the home screen, and opening one. */
  | 'chart library'
  /** Each chart having a page of its own, which a reload stays on. */
  | 'chart pages'

/** Stitches the stitcher can see, numbered from 1 like a printed chart's margins. Ends are inclusive. */
export interface ShownStitches {
  across: [first: number, last: number]
  down: [first: number, last: number]
}

/** Which stitches one page of the source PDF covers, numbered from 1. Ends are inclusive. */
export interface SourcePagePlacement extends ShownStitches {
  /** The page's number in the source PDF, from 1. */
  page: number
}

export interface Size {
  width: number
  height: number
}

/** One chart the import gave. */
export interface ShownChart extends Size {
  /** Each legend entry's thread, such as 'DMC 310', and how many of the chart's stitches use it. Left out when a case doesn't care. */
  legend?: { thread: string; stitches: number }[]
}

/** One stitch: its column and row, numbered from 1 like a printed chart's margins. */
export type Stitch = [across: number, down: number]

/** One legend entry, as the stitcher reads it. */
export interface ShownLegendEntry {
  /** Each thread, such as 'DMC 310', with its name and strands where the legend prints them. Several make a blend. */
  threads: { thread: string; name?: string; strands?: number }[]
  /** The stitch count the legend prints, where it prints one. */
  printedStitches?: number
  /** The color the app shows the entry in, as `#RRGGBB`, or undefined when it knows none. */
  color?: string
}

/** A problem the import found that suggests the chart doesn't match its source PDF. */
export type ShownImportIssue =
  | { kind: 'size mismatch'; printed: Size; parsed: Size }
  /** The chart's cells are filled in but hold no symbols, as when a PDF prints it only as color blocks. */
  | { kind: 'no symbols' }
  /** A legend entry, named by its thread such as 'DMC 310', prints a different count from the stitches it has. */
  | { kind: 'legend count mismatch'; thread: string; printed: number; parsed: number; stitches: Stitch[] }
  /** A symbol printed in the chart that the legend doesn't list. */
  | { kind: 'symbol not in legend'; stitches: Stitch[] }
  /** A legend entry, named by its thread, that no stitch in the chart uses. */
  | { kind: 'legend entry with no stitches'; thread: string }

export interface Driver {
  readonly name: string
  readonly capabilities: ReadonlySet<Capability>
  importPdf(bytes: Uint8Array): Promise<void>
  /** Closes the app and opens it again, keeping what the browser stored. */
  reload(): Promise<void>
  /** The titles of the charts the home screen lists, in its order. */
  listedCharts(): Promise<string[]>
  /** Goes to the page listing every stored chart. */
  goToYourCharts(): Promise<void>
  /** Opens the chart with this title from the home screen. */
  openChart(title: string): Promise<void>
  /** The size of the chart the stitcher is looking at, in stitches. */
  shownChartSize(): Promise<{ width: number; height: number }>
  /** The longest the page was blocked during the last import, in milliseconds. */
  longestBlockDuringImport(): Promise<number>
  shownStitches(): Promise<ShownStitches>
  /** Where each page of the source PDF sits in the chart the stitcher is looking at. */
  sourcePagePlacements(): Promise<SourcePagePlacement[]>
  /** Every chart the last import gave, in the order the source PDF prints them. */
  importedCharts(): Promise<ShownChart[]>
  /** The legend of the chart the stitcher is looking at, row by row. */
  legend(): Promise<ShownLegendEntry[]>
  /** The title of the chart the stitcher is looking at, or undefined when it has none. */
  chartTitle(): Promise<string | undefined>
  /** The import issues of the chart the stitcher is looking at. */
  importIssues(): Promise<ShownImportIssue[]>
  zoomIn(): Promise<void>
  /** Drags the chart left, which brings stitches from its right into view. */
  dragChartLeft(): Promise<void>
}
