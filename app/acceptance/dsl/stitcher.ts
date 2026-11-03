// What a stitcher does and sees, in the glossary's terms. Cases state only what
// they care about; everything else gets a default here.
import { deepStrictEqual, ok } from 'node:assert/strict'
import { buildChartPdf, type LegendEntry, type SymbolDescription } from '../../tests/support/chartPdf.ts'
import type { Driver, ShownStitches } from '../drivers/driver.ts'

export type ChartSpec =
  /** One string per row, one symbol per cell, '.' for a blank cell. Symbols are '#' and '^'. */
  | { grid: string[] }
  /** A chart this size, in stitches, with every cell stitched. */
  | { size: { width: number; height: number } }

/** Longer than this and a stitcher notices the page freeze. */
const LONGEST_UNNOTICED_BLOCK_MS = 200

function gridOf(chart: ChartSpec) {
  if ('grid' in chart) return chart.grid
  const { width, height } = chart.size
  return Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_cell, column) => ((row + column) % 2 ? '#' : '^')).join(''),
  )
}

const SYMBOLS: Record<string, SymbolDescription> = {
  '#': { font: 'StitchSymbols', code: 0x41 },
  '^': { font: 'StitchSymbols', code: 0x42 },
}

const THREADS: Record<string, Pick<LegendEntry, 'thread' | 'name'>> = {
  '#': { thread: { brand: 'DMC', code: '310' }, name: 'Black' },
  '^': { thread: { brand: 'DMC', code: '321' }, name: 'Red' },
}

function chartPdf(chart: ChartSpec) {
  const grid = gridOf(chart)
  const counts = new Map<string, number>()
  for (const symbol of grid.join('')) {
    if (symbol !== '.') counts.set(symbol, (counts.get(symbol) ?? 0) + 1)
  }
  return buildChartPdf({
    fonts: { StitchSymbols: { glyphs: { 0x41: 'square', 0x42: 'triangle' } } },
    symbols: SYMBOLS,
    pages: [
      { type: 'chart', cell: { width: 10, height: 10 }, grid },
      {
        type: 'legend',
        entries: [...counts].map(([symbol, count]) => ({ symbol, ...THREADS[symbol], strands: 2, count })),
      },
    ],
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

  async seesChart(expected: { width: number; height: number }) {
    deepStrictEqual(await this.driver.shownChartSize(), expected)
  }

  async seesStitches(expected: ShownStitches) {
    deepStrictEqual(await this.driver.shownStitches(), expected)
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
