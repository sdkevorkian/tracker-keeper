// @vitest-environment node
import { expect, test } from 'vitest'
import { createWorkspace } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import { buildChartPdf, type ChartPage, type PageDescription } from '../support/chartPdf.ts'

const SYMBOLS = ['#', '^', '@']

/** A grid of all three symbols. Along a row it repeats every 3 stitches, as chart backgrounds often do. */
function patternGrid(width: number, height: number) {
  return Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_cell, column) => SYMBOLS[(row * row + column * (column + row)) % 3]).join(''),
  )
}

async function importChart(chart: Omit<ChartPage, 'type' | 'cell'>, extraPages: PageDescription[] = []) {
  const workspace = createWorkspace({ readCharts: readChartsInProcess })
  // The legend lists the symbols the grid uses, each with its true count.
  const count = (symbol: string) => [...chart.grid.join('')].filter((cell) => cell === symbol).length
  const chartId = await workspace.importPdf(
    buildChartPdf({
      fonts: { StitchSymbols: { glyphs: { 0x41: 'square', 0x42: 'triangle', 0x43: 'square' } } },
      symbols: {
        '#': { font: 'StitchSymbols', code: 0x41 },
        '^': { font: 'StitchSymbols', code: 0x42 },
        '@': { font: 'StitchSymbols', code: 0x43 },
      },
      pages: [
        { type: 'chart', cell: { width: 10, height: 10 }, ...chart },
        {
          type: 'legend',
          entries: [
            { symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: count('#') },
            { symbol: '^', thread: { brand: 'DMC', code: '321' }, name: 'Red', strands: 2, count: count('^') },
            { symbol: '@', thread: { brand: 'DMC', code: '995' }, name: 'Blue', strands: 2, count: count('@') },
          ].filter((entry) => entry.count > 0),
        },
        ...extraPages,
      ],
    }),
  )
  return { workspace, chart: workspace.state.charts.get(chartId)! }
}

/** The grid as the chart's cells: the nth legend entry is the nth symbol. */
function cellsOf(grid: string[]) {
  return [...grid.join('')].map((symbol) => SYMBOLS.indexOf(symbol) + 1)
}

test('pages joined by margin numbers give every stitch of the whole chart in its place', async () => {
  const grid = patternGrid(24, 22)

  const { workspace, chart } = await importChart({ grid, pageSize: { width: 12, height: 11 }, marginNumbers: true })

  expect(workspace.state.charts.size).toBe(1)
  expect({ width: chart.width, height: chart.height }).toEqual({ width: 24, height: 22 })
  expect(Array.from(chart.cells)).toEqual(cellsOf(grid))
})

test('pages joined by margin numbers padded with spaces to line up give every stitch of the whole chart in its place', async () => {
  const grid = patternGrid(24, 22)

  const { workspace, chart } = await importChart({ grid, pageSize: { width: 12, height: 11 }, marginNumbers: 'padded' })

  expect(workspace.state.charts.size).toBe(1)
  expect({ width: chart.width, height: chart.height }).toEqual({ width: 24, height: 22 })
  expect(Array.from(chart.cells)).toEqual(cellsOf(grid))
})

test('arrows outside the grid marking where pages align are not taken for grid lines', async () => {
  // 2 × 2 pages of 12 × 11 stitches, repeating 2 each way.
  const grid = patternGrid(22, 20)

  const { workspace, chart } = await importChart({
    grid,
    pageSize: { width: 12, height: 11 },
    overlap: 2,
    marginNumbers: true,
    overlapMarks: true,
  })

  expect(workspace.state.charts.size).toBe(1)
  expect({ width: chart.width, height: chart.height }).toEqual({ width: 22, height: 20 })
  expect(Array.from(chart.cells)).toEqual(cellsOf(grid))
})

test('pages that repeat only blank stitches are joined by the stitches they shade as repeated', async () => {
  // Columns 9 to 12 are blank, so they look the same however many of them the second page repeats.
  const grid = patternGrid(20, 5).map((row) => row.slice(0, 8) + '....' + row.slice(12))

  const { chart } = await importChart({ grid, pageSize: { width: 12, height: 5 }, overlap: 4, overlapMarks: true })

  expect({ width: chart.width, height: chart.height }).toEqual({ width: 20, height: 5 })
  expect(Array.from(chart.cells)).toEqual(
    grid
      .join('')
      .split('')
      .map((symbol) => SYMBOLS.indexOf(symbol) + 1),
  )
})

test('a strip of pages that repeat a few columns, with no margin numbers, gives each stitch once in its place', async () => {
  const grid = patternGrid(25, 6)

  const { workspace, chart } = await importChart({ grid, pageSize: { width: 11, height: 6 }, overlap: 3 })

  expect(workspace.state.charts.size).toBe(1)
  expect({ width: chart.width, height: chart.height }).toEqual({ width: 25, height: 6 })
  expect(Array.from(chart.cells)).toEqual(cellsOf(grid))
  expect(chart.source.pages.map(({ across }) => across)).toEqual([
    [1, 11],
    [9, 19],
    [17, 25],
  ])
})

test('a size printed as stitches in a line of text is checked against the parsed size', async () => {
  const { chart } = await importChart({ grid: patternGrid(5, 4) }, [
    { type: 'text', lines: ['Test Sampler', 'Design size: 6 x 4 stitches'] },
  ])

  expect(chart.importIssues).toEqual([
    { kind: 'size mismatch', printed: { width: 6, height: 4 }, parsed: { width: 5, height: 4 } },
  ])
})
