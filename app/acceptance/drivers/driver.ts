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
  /** Deleting a chart, after confirming. */
  | 'delete charts'
  /** Reading the confirmation a delete asks for, and cancelling it. */
  | 'delete confirmation'
  /** Each chart having a page of its own, which a reload stays on. */
  | 'chart pages'
  /** Opening the source PDF at the page that covers the view. */
  | 'view source PDF'
  /** Switching how the chart is drawn, and reading which way it is. */
  | 'display styles'
  /** Reading whether each legend entry's symbol is drawn as printed or built in. */
  | 'symbol images'
  /** Moving the view with the buttons beside the chart and the keyboard, not only the pointer. */
  | 'view controls'

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

/** Where the stitcher deletes a chart from. */
export type DeleteFrom = 'Your charts' | 'its page'

/** How the app draws a chart on screen. */
export type DisplayStyle = 'symbols only' | 'color blocks' | 'color with symbols'

export interface ShownSymbols {
  asPrinted: number
  builtIn: number
}

/** How the stitcher moves the view: the pointer (wheel, trackpad or drag), a touchscreen, the buttons beside the chart, or the keyboard. */
export type ViewControl = 'pointer' | 'touch' | 'buttons' | 'keyboard'

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
  /**
   * Deletes the chart with this title, confirming when asked: from Your charts,
   * or from its own page, which the stitcher is on.
   */
  deleteChart(title: string, from: DeleteFrom): Promise<void>
  /** Starts deleting the chart with this title from Your charts, stopping at the confirmation. */
  startDeletingChart(title: string): Promise<void>
  /** The text of the confirmation on screen. */
  deleteConfirmation(): Promise<string>
  cancelDelete(): Promise<void>
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
  /** How many legend entries of the chart on screen have their symbol drawn as the source PDF prints it, and how many a built-in one. */
  shownSymbols(): Promise<ShownSymbols>
  /** How the chart on screen is drawn. */
  displayStyle(): Promise<DisplayStyle>
  switchDisplayStyle(style: DisplayStyle): Promise<void>
  /** Opens the source PDF from the chart view, returning the page it opened at. */
  viewSourcePdf(): Promise<number>
  /**
   * Zooms all the way in and back out, dragging the chart between, as a stitcher looking around would.
   * Returns the longest the page was blocked meanwhile, in milliseconds.
   */
  panAndZoomAround(): Promise<number>
  zoomIn(using: ViewControl): Promise<void>
  zoomOut(using: ViewControl): Promise<void>
  /** Moves the view right, which brings stitches from the chart's right into view. */
  panRight(using: Exclude<ViewControl, 'buttons'>): Promise<void>
  /** Presses Tab until the chart has focus, failing if it never does. */
  tabToChart(): Promise<void>
  /** Whether the chart has focus and shows a visible focus ring. */
  chartFocusRingShown(): Promise<boolean>
  /** Goes back to showing the whole chart. */
  fitChart(using: Extract<ViewControl, 'buttons' | 'keyboard'>): Promise<void>
  /** Drags the chart left, which brings stitches from its right into view. */
  dragChartLeft(): Promise<void>
}
