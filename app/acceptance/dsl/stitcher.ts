// What a stitcher does and sees, in the glossary's terms. Cases state only what
// they care about; everything else gets a default here.
import { deepStrictEqual, ok } from 'node:assert/strict'
import {
  buildChartPdf,
  type LegendBoxes,
  type LegendColumn,
  type LegendEntry,
  type LegendThread,
  type PageDescription,
  type PdfStyle,
  type SymbolDescription,
} from '../../tests/support/chartPdf.ts'
import type {
  ChartPlace,
  Direction,
  DisplayStyle,
  Driver,
  ShownChart,
  ShownImportIssue,
  ShownLegendEntry,
  ShownProject,
  ShownStitches,
  ShownSymbols,
  SourcePagePlacement,
  Stitch,
  UndoControl,
  ViewControl,
} from '../drivers/driver.ts'

/** How the legend prints one symbol's row, where a case cares. */
export interface LegendRowSpec {
  /** Each thread, such as 'DMC 310', and its strands. Several make a blend. */
  threads?: { thread: string; strands: number }[]
  /** The color of a swatch printed on the row, as `#RRGGBB`. None by default. */
  swatch?: string
  /** The stitch count the row prints. The symbol's true count by default. */
  printedCount?: number
}

export type ChartSpec =
  /** One string per row, one symbol per cell, '.' for a blank cell. Symbols are '#' and '^'. */
  (
    | { grid: string[] }
    /** A chart this size, in stitches, with every cell stitched. */
    | { size: { width: number; height: number } }
  ) & {
    /** How many pages the source PDF spreads the chart over. One page by default. */
    printedOn?: { pagesAcross: number; pagesDown: number }
    /** Whether the pages print every 10th row and column number in their margins. */
    marginNumbers?: boolean
    /** How many rows and columns neighbouring pages repeat. None by default. */
    overlap?: number
    /** The size an info page prints for the chart, in stitches. No info page by default. */
    printedSize?: { width: number; height: number }
    /** The title an info page prints for the chart. No info page by default. */
    printedTitle?: string
    /** Each PDF style the source PDF prints the whole chart in, in order. Symbols on white by default. */
    printedIn?: PdfStyle[]
    /**
     * How the legend prints a symbol's row, where it differs from the default:
     * one thread in 2 strands and the symbol's true stitch count. A symbol
     * given here that the grid doesn't use still gets a row, after the others.
     */
    legend?: Record<string, LegendRowSpec | 'not printed'>
    /** Heading lines the legend prints above its entries, each naming the columns it heads. None by default. */
    legendHeadings?: Partial<Record<LegendColumn, string>>[]
    /** Ruled boxes the legend draws. Framed swatches print each row's swatch in its symbol's color. None by default. */
    legendBoxes?: LegendBoxes
  }

/** Longer than this and a stitcher notices the page freeze. */
const LONGEST_UNNOTICED_BLOCK_MS = 200

/**
 * Longer than this and panning or zooming stutters. The browser reports only tasks
 * longer than this, so any it reports at all is a stutter.
 */
const LONGEST_SMOOTH_FRAME_MS = 50

/**
 * A fixed pseudo-random pattern, so rows and columns repeated between pages
 * match only where they really repeat.
 */
function gridOf(chart: ChartSpec) {
  if ('grid' in chart) return chart.grid
  const { width, height } = chart.size
  // xorshift32, from a fixed seed.
  let seed = 1
  const next = () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return seed >>> 0
  }
  return Array.from({ length: height }, () => Array.from({ length: width }, () => (next() % 2 ? '#' : '^')).join(''))
}

const SYMBOLS: Record<string, SymbolDescription> = {
  '#': { font: 'StitchSymbols', code: 0x41 },
  '^': { font: 'StitchSymbols', code: 0x42 },
}

/** Each symbol's thread, when the case doesn't say. */
const THREADS: Record<string, string> = { '#': 'DMC 310', '^': 'DMC 321' }

/** The name the legend prints for each thread. */
const THREAD_NAMES: Record<string, string> = {
  'DMC 310': 'Black',
  'DMC 321': 'Red',
  'DMC 3371': 'Black Brown',
  'Anchor 403': 'Black',
  'Cosmo 2500': 'Charcoal',
}

/** A legend row's thread, from a thread such as 'DMC 310'. The code is the last word. */
function legendThread(thread: string, strands: number): LegendThread {
  const [code, ...brand] = thread.split(' ').reverse()
  return { thread: { brand: brand.reverse().join(' '), code }, name: THREAD_NAMES[thread] ?? 'Thread', strands }
}

function legendEntry(symbol: string, stitches: number, spec: LegendRowSpec = {}): LegendEntry {
  const count = spec.printedCount ?? stitches
  const threads = (spec.threads ?? [{ thread: THREADS[symbol], strands: 2 }]).map(({ thread, strands }) =>
    legendThread(thread, strands),
  )
  const row = { symbol, count, swatch: spec.swatch }
  return threads.length === 1 ? { ...row, ...threads[0] } : { ...row, threads }
}

/** The color a PDF style with color fills each symbol's cells with. */
const COLORS: Record<string, string> = { '#': '#000000', '^': '#C72B3B' }

function pageSizeOf({ printedOn, overlap = 0 }: ChartSpec, grid: string[]) {
  if (!printedOn) return undefined
  // Every page but the first repeats `overlap` stitches from the page before.
  const perPage = (length: number, pages: number) => Math.ceil((length + (pages - 1) * overlap) / pages)
  return {
    width: perPage(Math.max(...grid.map((row) => row.length)), printedOn.pagesAcross),
    height: perPage(grid.length, printedOn.pagesDown),
  }
}

/** An info page like the one chart software prints, giving the chart's title and size. */
function infoPage({ printedSize, printedTitle }: ChartSpec): PageDescription[] {
  if (!printedSize && !printedTitle) return []
  return [
    {
      type: 'table',
      cell: { width: 100, height: 16 },
      rows: [
        ['Title', printedTitle ?? 'Test Sampler'],
        ...(printedSize ? [['Grid Size', `${printedSize.width}W x ${printedSize.height}H`]] : []),
      ],
    },
  ]
}

/** A design's chart pages, then its legend, then its info page if it has one. */
function designPages(chart: ChartSpec): PageDescription[] {
  const grid = gridOf(chart)
  const counts = new Map<string, number>()
  for (const symbol of grid.join('')) {
    if (symbol !== '.') counts.set(symbol, (counts.get(symbol) ?? 0) + 1)
  }
  for (const symbol of Object.keys(chart.legend ?? {})) {
    if (!counts.has(symbol)) counts.set(symbol, 0)
  }
  return [
    ...(chart.printedIn ?? ['symbols']).map((style): PageDescription => ({
      type: 'chart',
      style,
      colors: COLORS,
      cell: { width: 10, height: 10 },
      grid,
      pageSize: pageSizeOf(chart, grid),
      overlap: chart.overlap,
      marginNumbers: chart.marginNumbers,
    })),
    {
      type: 'legend',
      headings: chart.legendHeadings,
      boxes: chart.legendBoxes,
      entries: [...counts].flatMap(([symbol, count]) => {
        const spec = chart.legend?.[symbol]
        if (spec === 'not printed') return []
        const swatch = chart.legendBoxes === 'framed swatches' ? COLORS[symbol] : undefined
        return [legendEntry(symbol, count, { swatch, ...spec })]
      }),
    },
    ...infoPage(chart),
  ]
}

/** A source PDF holding each design in turn. */
function chartPdf(...designs: ChartSpec[]) {
  return buildChartPdf({
    fonts: { StitchSymbols: { glyphs: { 0x41: 'square', 0x42: 'triangle' } } },
    symbols: SYMBOLS,
    pages: designs.flatMap(designPages),
  })
}

const count = ([first, last]: [number, number]) => last - first + 1

export class Stitcher {
  private driver: Driver
  /** What was on screen before the last zoom or drag. */
  private shownBefore?: ShownStitches
  /** The page the source PDF last opened at. */
  private sourcePdfPage?: number
  /** The longest the page was blocked during the last pan and zoom around the chart. */
  private longestPanOrZoomBlock?: number
  /** The charts the app named when told the last PDF had been imported before. */
  private namedImportedBefore?: string[]
  /** Why the app refused the last delete the stitcher tried, if it did. */
  private refusal?: string

  constructor(driver: Driver) {
    this.driver = driver
  }

  async importsChart(chart: ChartSpec) {
    await this.driver.importPdf(chartPdf(chart))
  }

  /** Imports the same source PDF as a chart imported before, which the app stops to ask about. */
  async importsTheSamePdfAgain(chart: ChartSpec) {
    this.namedImportedBefore = await this.driver.importPdfImportedBefore(chartPdf(chart))
  }

  /** The app said the PDF was imported before, naming these charts. */
  async isToldItWasImportedBefore(titles: string[]) {
    deepStrictEqual(this.namedImportedBefore, titles)
  }

  async opensChartImportedBefore(title: string) {
    await this.driver.openChartImportedBefore(title)
  }

  /** Imports a separate copy, under a title of their own or the one the app suggests. */
  async importsSeparateCopy({ titled }: { titled?: string } = {}) {
    await this.driver.importSeparateCopy(titled === undefined ? undefined : [titled])
  }

  async cancelsImport() {
    await this.driver.cancelImport()
  }

  /** Imports one source PDF that holds several separate designs, one after another. */
  async importsPdfOfDesigns(designs: ChartSpec[]) {
    await this.driver.importPdf(chartPdf(...designs))
  }

  /** Closes the app and opens it again, as a stitcher coming back another day would. */
  async reloadsTheApp() {
    await this.driver.reload()
  }

  /** The charts the home screen lists, by title, in the order it lists them. */
  async seesChartsListed(expected: string[]) {
    deepStrictEqual(await this.driver.listedCharts(), expected)
  }

  /** Starts a project on the chart they're looking at, which opens it. */
  async startsProject() {
    await this.driver.startProject()
  }

  async renamesProject(name: string) {
    await this.driver.renameProject(name)
  }

  async marksStitchDone(stitch: Stitch) {
    await this.driver.markStitch(stitch, true)
  }

  async marksStitchNotDone(stitch: Stitch) {
    await this.driver.markStitch(stitch, false)
  }

  /** Drags from one stitch to another along a row or column, marking the run done. */
  async marksRunDone(from: Stitch, to: Stitch) {
    await this.driver.markRun(from, to)
  }

  /** Undoes their last mark. With the Undo button by default. */
  async undoes(using: UndoControl = 'buttons') {
    await this.driver.undo(using)
  }

  async redoes(using: UndoControl = 'buttons') {
    await this.driver.redo(using)
  }

  async seesUndoAndRedoOffered(expected: { undo: boolean; redo: boolean }) {
    deepStrictEqual(await this.driver.undoAndRedoOffered(), expected)
  }

  /** Presses an arrow key on the chart, `times` times. With `marking`, holds Shift to mark a run as it goes. */
  async movesCursor(direction: Direction, { times = 1, marking = false }: { times?: number; marking?: boolean } = {}) {
    for (let press = 0; press < times; press++) await this.driver.moveCursor(direction, marking)
  }

  async pressesSpace() {
    await this.driver.pressSpace()
  }

  async seesCursorOn(expected: Stitch) {
    deepStrictEqual(await this.driver.cursor(), expected)
  }

  /** The stitch under the cell cursor is among those on screen. */
  async seesCursorInView() {
    const [across, down] = await this.driver.cursor()
    const shown = await this.driver.shownStitches()
    ok(
      across >= shown.across[0] && across <= shown.across[1] && down >= shown.down[0] && down <= shown.down[1],
      `The cursor is on stitch ${across}, ${down}, but the view shows ${shown.across} across and ${shown.down} down`,
    )
  }

  /** How much of the project they're in is done, in whole percent. */
  async seesPercentDone(expected: number) {
    deepStrictEqual(await this.driver.percentDone(), expected)
  }

  async pressesKey(key: string) {
    await this.driver.pressKey(key)
  }

  async opensShortcutHelp(using: 'keyboard' | 'button') {
    await this.driver.openShortcutHelp(using)
  }

  /** The open shortcut help lists a shortcut for each of these. */
  async seesShortcutsFor(expected: string[]) {
    const listed = await this.driver.shortcutHelp()
    ok(listed, 'The shortcut help is not open')
    const missing = expected.filter((does) => !listed.includes(does))
    deepStrictEqual(missing, [], `The shortcut help doesn't list ${missing.join(', ')}`)
  }

  async closesShortcutHelp() {
    await this.driver.closeShortcutHelp()
  }

  async seesNoShortcutHelp() {
    deepStrictEqual(await this.driver.shortcutHelp(), undefined)
  }

  async focusesProjectName() {
    await this.driver.focusProjectName()
  }

  async seesFocusBackOnTheShortcutsButton() {
    ok(await this.driver.shortcutButtonFocused(), 'The Keyboard shortcuts button does not have focus')
  }

  /** The projects Your charts lists under a chart, in its order. */
  async seesProjectsListed(chartTitle: string, expected: ShownProject[]) {
    deepStrictEqual(await this.driver.listedProjects(chartTitle), expected)
  }

  async goesToYourCharts() {
    await this.driver.goToYourCharts()
  }

  async opensChart(title: string) {
    await this.driver.openChart(title)
  }

  /** Opens a project from Your charts. */
  async opensProject(name: string) {
    await this.driver.openProject(name)
  }

  /** The legend panel's stitches left for each entry, by thread such as 'DMC 310'. */
  async seesStitchesLeft(expected: Record<string, number>) {
    deepStrictEqual(await this.driver.stitchesLeft(), expected)
  }

  async tabsToLegendEntry(thread: string) {
    await this.driver.tabToLegendEntry(thread)
  }

  /** The chart shows this thread's legend entry highlighted, and the others dimmed. */
  async seesHighlighted(thread: string) {
    deepStrictEqual(await this.driver.highlighted(), thread)
  }

  async seesNothingHighlighted() {
    deepStrictEqual(await this.driver.highlighted(), undefined)
  }

  /** Gives a chart a title of their own. From Your charts by default. */
  async renamesChart(title: string, newTitle: string, { from = 'Your charts' }: { from?: ChartPlace } = {}) {
    await this.driver.renameChart(title, newTitle, from)
  }

  /** Deletes a chart, confirming when asked. From Your charts by default. */
  async deletesChart(title: string, { from = 'Your charts' }: { from?: ChartPlace } = {}) {
    await this.driver.deleteChart(title, from)
  }

  /** Starts deleting a chart from Your charts, stopping when asked to confirm. */
  async startsDeletingChart(title: string) {
    await this.driver.startDeletingChart(title)
  }

  /** Tries to delete a chart from Your charts, which the app may refuse. */
  async triesToDeleteChart(title: string) {
    this.refusal = await this.driver.tryDeletingChart(title)
  }

  /** The app refused the last delete, saying how many projects the chart has and that they must go first. */
  async isToldToDeleteProjectsFirst(projects: number) {
    const refusal = this.refusal
    ok(refusal, 'The app did not refuse the delete')
    ok(
      refusal.includes(`${projects} ${projects === 1 ? 'project' : 'projects'}`),
      `The refusal doesn't say the chart has ${projects}: "${refusal}"`,
    )
    ok(/delete (it|them) first/i.test(refusal), `The refusal doesn't say to delete them first: "${refusal}"`)
  }

  /** Deletes a project, confirming when asked. From Your charts by default. */
  async deletesProject(name: string, { from = 'Your charts' }: { from?: ChartPlace } = {}) {
    await this.driver.deleteProject(name, from)
  }

  /** Starts deleting a project from Your charts, stopping when asked to confirm. */
  async startsDeletingProject(name: string) {
    await this.driver.startDeletingProject(name)
  }

  /** The confirmation names what's being deleted and says what will be lost with it. */
  async isAskedToConfirmDeleting(title: string, { losing }: { losing: string }) {
    const confirmation = await this.driver.deleteConfirmation()
    ok(confirmation.includes(title), `The confirmation doesn't name "${title}": "${confirmation}"`)
    ok(
      confirmation.includes(`${losing} will be lost`),
      `The confirmation doesn't say its ${losing} will be lost: "${confirmation}"`,
    )
  }

  async cancelsDeleting() {
    await this.driver.cancelDelete()
  }

  async seesChart(expected: { width: number; height: number }) {
    deepStrictEqual(await this.driver.shownChartSize(), expected)
  }

  /** Every chart the last import gave, in the order the source PDF prints them. */
  async seesCharts(expected: ShownChart[]) {
    const charts = await this.driver.importedCharts()
    // Legends are compared only where the case gives one.
    const shown = charts.map(({ legend, ...size }, i) => (expected[i]?.legend ? { ...size, legend } : size))
    deepStrictEqual(shown, expected)
  }

  async seesStitches(expected: ShownStitches) {
    deepStrictEqual(await this.driver.shownStitches(), expected)
  }

  async seesChartTitled(expected: string) {
    deepStrictEqual(await this.driver.chartTitle(), expected)
  }

  /** The legend of the chart the stitcher is looking at, row by row. Colors are compared only where the case gives one. */
  async seesLegend(expected: ShownLegendEntry[]) {
    const legend = await this.driver.legend()
    const shown = legend.map(({ color, ...entry }, i) =>
      expected[i] && 'color' in expected[i] ? { ...entry, color } : entry,
    )
    deepStrictEqual(shown, expected)
  }

  async seesSourcePagesPlaced(expected: SourcePagePlacement[]) {
    deepStrictEqual(await this.driver.sourcePagePlacements(), expected)
  }

  async seesImportIssues(expected: ShownImportIssue[]) {
    deepStrictEqual(await this.driver.importIssues(), expected)
  }

  async seesNoImportIssues() {
    deepStrictEqual(await this.driver.importIssues(), [])
  }

  async seesSymbols(expected: ShownSymbols) {
    deepStrictEqual(await this.driver.shownSymbols(), expected)
  }

  async switchesDisplayStyle(style: DisplayStyle) {
    await this.driver.switchDisplayStyle(style)
  }

  async seesDisplayStyle(expected: DisplayStyle) {
    deepStrictEqual(await this.driver.displayStyle(), expected)
  }

  async viewsSourcePdf() {
    this.sourcePdfPage = await this.driver.viewSourcePdf()
  }

  async seesSourcePdfOpenAtPage(expected: number) {
    deepStrictEqual(this.sourcePdfPage, expected)
  }

  async zoomsIn(using: ViewControl = 'pointer') {
    this.shownBefore = await this.driver.shownStitches()
    await this.driver.zoomIn(using)
  }

  async seesFewerStitchesThanBefore() {
    const before = this.shownBefore!
    const now = await this.driver.shownStitches()
    ok(count(now.across) < count(before.across), `Columns shown went from ${before.across} to ${now.across}`)
    ok(count(now.down) < count(before.down), `Rows shown went from ${before.down} to ${now.down}`)
  }

  async zoomsOut(using: ViewControl = 'pointer') {
    this.shownBefore = await this.driver.shownStitches()
    await this.driver.zoomOut(using)
  }

  async seesMoreStitchesThanBefore() {
    const before = this.shownBefore!
    const now = await this.driver.shownStitches()
    ok(count(now.across) > count(before.across), `Columns shown went from ${before.across} to ${now.across}`)
    ok(count(now.down) > count(before.down), `Rows shown went from ${before.down} to ${now.down}`)
  }

  async pansRight(using: Exclude<ViewControl, 'buttons'> = 'pointer') {
    this.shownBefore = await this.driver.shownStitches()
    await this.driver.panRight(using)
  }

  async tabsToTheChart() {
    await this.driver.tabToChart()
  }

  async seesTheChartFocused() {
    ok(await this.driver.chartFocusRingShown(), 'The chart has no visible focus ring')
  }

  async fitsTheChart(using: Extract<ViewControl, 'buttons' | 'keyboard'> = 'buttons') {
    await this.driver.fitChart(using)
  }

  async dragsTheChartLeft() {
    this.shownBefore = await this.driver.shownStitches()
    await this.driver.dragChartLeft()
  }

  /** Remembers what's on screen, to compare with later. */
  async notesTheStitchesShown() {
    this.shownBefore = await this.driver.shownStitches()
  }

  async seesTheSameStitchesShown() {
    deepStrictEqual(await this.driver.shownStitches(), this.shownBefore)
  }

  async seesStitchesFurtherRightThanBefore() {
    const before = this.shownBefore!
    const now = await this.driver.shownStitches()
    ok(now.across[0] > before.across[0], `Columns shown went from ${before.across} to ${now.across}`)
    deepStrictEqual(now.down, before.down)
  }

  async pansAndZoomsAroundTheChart() {
    this.longestPanOrZoomBlock = await this.driver.panAndZoomAround()
  }

  async sawPanningAndZoomingStaySmooth() {
    const longest = this.longestPanOrZoomBlock!
    ok(longest <= LONGEST_SMOOTH_FRAME_MS, `Panning and zooming blocked the page for ${Math.round(longest)} ms`)
  }

  async couldKeepUsingTheAppWhileItImported() {
    const longest = await this.driver.longestBlockDuringImport()
    ok(longest <= LONGEST_UNNOTICED_BLOCK_MS, `The page was blocked for ${Math.round(longest)} ms during import`)
  }
}
