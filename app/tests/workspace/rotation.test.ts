// @vitest-environment node
// A PDF can store a page sideways and tell viewers to turn it upright; import reads it as a viewer shows it.
import { expect, test } from 'vitest'
import { createWorkspace } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import { buildChartPdf, type ChartPage, type Rotation } from '../support/chartPdf.ts'

// Wider than tall, and the same no way round, so a chart read on its side can't pass.
const GRID = ['#^..', '.^#^', '##.^']
/** GRID as cells: 0 is blank, n is legend entry n. */
const CELLS = [1, 2, 0, 0, 0, 2, 1, 2, 1, 1, 0, 2]

/** How many cells of a grid hold a symbol. */
function countOf(grid: string[], symbol: string) {
  return [...grid.join('')].filter((name) => name === symbol).length
}

/** What the import reads: each chart's size, cells, how many legend entries and its import issues. */
async function importChart(rotate: Rotation | undefined, chart: Partial<ChartPage> = {}) {
  return (await importCharts(rotate, chart)).map(({ width, height, cells, legend, importIssues }) => ({
    width,
    height,
    cells: Array.from(cells),
    legend: legend.length,
    importIssues,
  }))
}

/** Imports a chart and a legend that counts its stitches, every page stored turned by `rotate`. */
async function importCharts(rotate: Rotation | undefined, chart: Partial<ChartPage> = {}) {
  const grid = chart.grid ?? GRID
  const workspace = createWorkspace({ readCharts: readChartsInProcess })
  await workspace.importPdf(
    buildChartPdf({
      rotate,
      fonts: { StitchSymbols: { glyphs: { 0x41: 'square', 0x42: 'triangle' } } },
      symbols: {
        '#': { font: 'StitchSymbols', code: 0x41 },
        '^': { font: 'StitchSymbols', code: 0x42 },
      },
      pages: [
        { type: 'chart', cell: { width: 10, height: 10 }, grid: GRID, ...chart },
        {
          type: 'legend',
          entries: [
            {
              symbol: '#',
              thread: { brand: 'DMC', code: '310' },
              name: 'Black',
              strands: 2,
              count: countOf(grid, '#'),
            },
            { symbol: '^', thread: { brand: 'DMC', code: '321' }, name: 'Red', strands: 2, count: countOf(grid, '^') },
          ],
        },
      ],
    }),
  )
  return [...workspace.state.charts.values()]
}

test('the legend on a page stored turned 90° is read, each symbol with its thread', async () => {
  const [chart] = await importCharts(90)

  expect(chart.legend).toEqual([
    {
      symbol: { font: 'StitchSymbols', code: 0x41 },
      threads: [{ brand: 'DMC', code: '310', name: 'Black', strands: 2 }],
      color: expect.any(String),
      printedCount: 4,
    },
    {
      symbol: { font: 'StitchSymbols', code: 0x42 },
      threads: [{ brand: 'DMC', code: '321', name: 'Red', strands: 2 }],
      color: expect.any(String),
      printedCount: 4,
    },
  ])
})

test('a one-page chart stored turned 90° reads as it does upright', async () => {
  expect(await importChart(90)).toEqual([{ width: 4, height: 3, cells: CELLS, legend: 2, importIssues: [] }])
})

/** A fixed pseudo-random grid of both symbols, so no page matches another by chance. */
function scatteredGrid(width: number, height: number) {
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

/** A grid as cells: '#' is legend entry 1, '^' is 2, '.' is blank. */
function cellsOf(grid: string[]) {
  return [...grid.join('')].map((name) => '.#^'.indexOf(name))
}

test('a chart over two pages stored turned 90°, joined by margin numbers, reads as one chart', async () => {
  // Two pages of 12 × 10 stitches, which print the column numbers 10 and 20 and the row number 10.
  const grid = scatteredGrid(24, 10)

  expect(await importChart(90, { grid, pageSize: { width: 12, height: 10 }, marginNumbers: true })).toEqual([
    { width: 24, height: 10, cells: cellsOf(grid), legend: 2, importIssues: [] },
  ])
})

test('a chart stored turned 270° reads as one turned 90° does', async () => {
  const read = [{ width: 4, height: 3, cells: CELLS, legend: 2, importIssues: [] }]

  expect(await importChart(270)).toEqual(read)
  expect(await importChart(90)).toEqual(read)
})
