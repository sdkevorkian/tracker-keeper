// What a stitcher does and sees, in the glossary's terms. Cases state only what
// they care about; everything else gets a default here.
import { deepStrictEqual, ok } from 'node:assert/strict'
import {
  buildChartPdf,
  type LegendEntry,
  type PageDescription,
  type PdfStyle,
  type SymbolDescription,
} from '../../tests/support/chartPdf.ts'
import type { Driver, ShownChart, ShownImportIssue, ShownStitches, SourcePagePlacement } from '../drivers/driver.ts'

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
    /** Each PDF style the source PDF prints the whole chart in, in order. Symbols on white by default. */
    printedIn?: PdfStyle[]
  }

/** Longer than this and a stitcher notices the page freeze. */
const LONGEST_UNNOTICED_BLOCK_MS = 200

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

const THREADS: Record<string, Pick<LegendEntry, 'thread' | 'name'>> = {
  '#': { thread: { brand: 'DMC', code: '310' }, name: 'Black' },
  '^': { thread: { brand: 'DMC', code: '321' }, name: 'Red' },
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

/** An info page like the one chart software prints, giving the chart's size. */
function infoPage({ printedSize }: ChartSpec): PageDescription[] {
  if (!printedSize) return []
  return [
    {
      type: 'table',
      cell: { width: 100, height: 16 },
      rows: [
        ['Title', 'Test Sampler'],
        ['Grid Size', `${printedSize.width}W x ${printedSize.height}H`],
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
      entries: [...counts].map(([symbol, count]) => ({ symbol, ...THREADS[symbol], strands: 2, count })),
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

  constructor(driver: Driver) {
    this.driver = driver
  }

  async importsChart(chart: ChartSpec) {
    await this.driver.importPdf(chartPdf(chart))
  }

  /** Imports one source PDF that holds several separate designs, one after another. */
  async importsPdfOfDesigns(designs: ChartSpec[]) {
    await this.driver.importPdf(chartPdf(...designs))
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

  async seesSourcePagesPlaced(expected: SourcePagePlacement[]) {
    deepStrictEqual(await this.driver.sourcePagePlacements(), expected)
  }

  async seesImportIssues(expected: ShownImportIssue[]) {
    deepStrictEqual(await this.driver.importIssues(), expected)
  }

  async seesNoImportIssues() {
    deepStrictEqual(await this.driver.importIssues(), [])
  }

  async zoomsIn() {
    this.shownBefore = await this.driver.shownStitches()
    await this.driver.zoomIn()
  }

  async seesFewerStitchesThanBefore() {
    const before = this.shownBefore!
    const now = await this.driver.shownStitches()
    ok(count(now.across) < count(before.across), `Columns shown went from ${before.across} to ${now.across}`)
    ok(count(now.down) < count(before.down), `Rows shown went from ${before.down} to ${now.down}`)
  }

  async dragsTheChartLeft() {
    this.shownBefore = await this.driver.shownStitches()
    await this.driver.dragChartLeft()
  }

  async seesStitchesFurtherRightThanBefore() {
    const before = this.shownBefore!
    const now = await this.driver.shownStitches()
    ok(now.across[0] > before.across[0], `Columns shown went from ${before.across} to ${now.across}`)
    deepStrictEqual(now.down, before.down)
  }

  async couldKeepUsingTheAppWhileItImported() {
    const longest = await this.driver.longestBlockDuringImport()
    ok(longest <= LONGEST_UNNOTICED_BLOCK_MS, `The page was blocked for ${Math.round(longest)} ms during import`)
  }
}
