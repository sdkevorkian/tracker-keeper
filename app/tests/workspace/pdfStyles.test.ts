// @vitest-environment node
import { expect, test } from 'vitest'
import { createWorkspace } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import { buildChartPdf, type ChartPage, type LegendEntry, type PageDescription } from '../support/chartPdf.ts'

const SYMBOLS = ['#', '^', '@']
const COLORS = { '#': '#000000', '^': '#C72B3B', '@': '#2E6FC4' }

/** A grid of all three symbols that doesn't repeat along its rows or columns. */
function patternGrid(width: number, height: number) {
  return Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_cell, column) => SYMBOLS[(row * row + column * (column + row)) % 3]).join(''),
  )
}

function chartPage(chart: Omit<ChartPage, 'type' | 'cell' | 'colors'>): ChartPage {
  return { type: 'chart', cell: { width: 10, height: 10 }, colors: COLORS, ...chart }
}

const LEGEND: LegendEntry[] = [
  { symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 1 },
  { symbol: '^', thread: { brand: 'DMC', code: '321' }, name: 'Red', strands: 2, count: 1 },
  { symbol: '@', thread: { brand: 'DMC', code: '995' }, name: 'Blue', strands: 2, count: 1 },
]

async function importPdf(pages: PageDescription[]) {
  const workspace = createWorkspace({ readCharts: readChartsInProcess })
  await workspace.importPdf(
    buildChartPdf({
      fonts: { StitchSymbols: { glyphs: { 0x41: 'square', 0x42: 'triangle', 0x43: 'square' } } },
      symbols: {
        '#': { font: 'StitchSymbols', code: 0x41 },
        '^': { font: 'StitchSymbols', code: 0x42 },
        '@': { font: 'StitchSymbols', code: 0x43 },
      },
      pages,
    }),
  )
  return [...workspace.state.charts.values()]
}

/** The grid as cells, when the legend lists the symbols in SYMBOLS order. */
function cellsOf(grid: string[]) {
  return [...grid.join('')].map((symbol) => SYMBOLS.indexOf(symbol) + 1)
}

test('pages with no margin numbers, printed in two PDF styles one after the other, give one chart', async () => {
  const grid = patternGrid(25, 6)
  const pages = { grid, pageSize: { width: 11, height: 6 }, overlap: 3 }

  const charts = await importPdf([
    chartPage({ ...pages, style: 'symbols' }),
    chartPage({ ...pages, style: 'symbols on color' }),
    { type: 'legend', entries: LEGEND },
  ])

  expect(charts).toHaveLength(1)
  expect({ width: charts[0].width, height: charts[0].height }).toEqual({ width: 25, height: 6 })
  expect(Array.from(charts[0].cells)).toEqual(cellsOf(grid))
})

test('two designs that use the same symbols for different threads each keep their own legend', async () => {
  const charts = await importPdf([
    chartPage({ grid: ['#^', '^#'] }),
    { type: 'legend', entries: LEGEND.slice(0, 2) },
    chartPage({ grid: ['#^#'] }),
    {
      type: 'legend',
      entries: [
        { symbol: '#', thread: { brand: 'DMC', code: '995' }, name: 'Blue', strands: 2, count: 2 },
        { symbol: '^', thread: { brand: 'DMC', code: '3865' }, name: 'Winter White', strands: 2, count: 1 },
      ],
    },
  ])

  expect(charts.map(({ legend }) => legend.map(({ threads }) => threads[0].code))).toEqual([
    ['310', '321'],
    ['995', '3865'],
  ])
  expect(Array.from(charts[1].cells)).toEqual([1, 2, 1])
})

test('a PDF style that outlines each colored cell is read with the same grid as the others', async () => {
  // Only the upper rows are stitched, so the outlines make their lines several times longer than the rest.
  const grid = patternGrid(24, 20).map((row, i) => (i >= 12 ? '.'.repeat(24) : row))
  const pages = { grid, pageSize: { width: 12, height: 10 }, marginNumbers: true }

  const charts = await importPdf([
    chartPage({ ...pages, style: 'symbols' }),
    chartPage({ ...pages, style: 'symbols on color', outlineCells: true }),
    { type: 'legend', entries: LEGEND },
  ])

  expect(charts.map(({ width, height }) => ({ width, height }))).toEqual([{ width: 24, height: 20 }])
  expect(Array.from(charts[0].cells)).toEqual([...grid.join('')].map((symbol) => SYMBOLS.indexOf(symbol) + 1))
})
