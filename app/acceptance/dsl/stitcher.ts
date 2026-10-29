// What a stitcher does and sees, in the glossary's terms. Cases state only what
// they care about; everything else gets a default here.
import { deepStrictEqual } from 'node:assert/strict'
import { buildChartPdf, type LegendEntry, type SymbolDescription } from '../../tests/support/chartPdf.ts'
import type { Driver } from '../drivers/driver.ts'

export interface ChartSpec {
  /** One string per row, one symbol per cell, '.' for a blank cell. Symbols are '#' and '^'. */
  grid: string[]
}

const SYMBOLS: Record<string, SymbolDescription> = {
  '#': { font: 'StitchSymbols', code: 0x41 },
  '^': { font: 'StitchSymbols', code: 0x42 },
}

const THREADS: Record<string, Pick<LegendEntry, 'thread' | 'name'>> = {
  '#': { thread: { brand: 'DMC', code: '310' }, name: 'Black' },
  '^': { thread: { brand: 'DMC', code: '321' }, name: 'Red' },
}

function chartPdf({ grid }: ChartSpec) {
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

export class Stitcher {
  private driver: Driver

  constructor(driver: Driver) {
    this.driver = driver
  }

  async importsChart(chart: ChartSpec) {
    await this.driver.importPdf(chartPdf(chart))
  }

  async seesChart(expected: { width: number; height: number }) {
    deepStrictEqual(await this.driver.shownChartSize(), expected)
  }
}
