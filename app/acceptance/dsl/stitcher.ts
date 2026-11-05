// What a stitcher does and sees, in the glossary's terms. Cases state only what
// they care about; everything else gets a default here.
import { deepStrictEqual, ok } from 'node:assert/strict'
import {
  buildChartPdf,
  type LegendEntry,
  type LegendThread,
  type PageDescription,
  type PdfStyle,
  type SymbolDescription,
} from '../../tests/support/chartPdf.ts'
import type {
  Driver,
  ShownChart,
  ShownImportIssue,
  ShownLegendEntry,
  ShownStitches,
  SourcePagePlacement,
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
    /** Heading lines the legend prints above its entries, one string per column. None by default. */
    legendHeadings?: string[][]
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
      entries: [...counts].flatMap(([symbol, count]) => {
        const spec = chart.legend?.[symbol]
        return spec === 'not printed' ? [] : [legendEntry(symbol, count, spec)]
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
