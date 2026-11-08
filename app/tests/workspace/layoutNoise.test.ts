// @vitest-environment node
// Charting programs lay out chart pages in many ways; none of them should change what the chart reads as.
import { expect, test } from 'vitest'
import { createWorkspace } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import { buildChartPdf, type ChartPage } from '../support/chartPdf.ts'

const GRID = ['#^.', '.^#']
/** GRID as cells: 0 is blank, n is legend entry n. */
const CELLS = [1, 2, 0, 0, 2, 1]

/** How many cells of a grid hold a symbol. */
function countOf(grid: string[], symbol: string) {
  return [...grid.join('')].filter((name) => name === symbol).length
}

/** Imports one chart page, GRID unless the layout says otherwise, and a legend that counts its stitches. */
async function importChart(layout: Partial<ChartPage> = {}) {
  const grid = layout.grid ?? GRID
  const workspace = createWorkspace({ readCharts: readChartsInProcess })
  await workspace.importPdf(
    buildChartPdf({
      fonts: { StitchSymbols: { glyphs: { 0x20: 'blank', 0x41: 'square', 0x42: 'triangle' } } },
      symbols: {
        '#': { font: 'StitchSymbols', code: 0x41 },
        '^': { font: 'StitchSymbols', code: 0x42 },
      },
      pages: [
        { type: 'chart', cell: { width: 10, height: 10 }, grid: GRID, ...layout },
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
  return [...workspace.state.charts.values()].map(({ width, height, cells, legend, importIssues }) => ({
    width,
    height,
    cells: Array.from(cells),
    legend: legend.length,
    importIssues,
  }))
}

const READ = [{ width: 3, height: 2, cells: CELLS, legend: 2, importIssues: [] }]

test('space characters printed in blank cells leave them blank', async () => {
  expect(await importChart({ blankCells: { font: 'StitchSymbols', code: 0x20 } })).toEqual(READ)
})

test('colored cell backgrounds are not read as symbols', async () => {
  expect(await importChart({ style: 'symbols on color', colors: { '#': '#000000', '^': '#C72B3B' } })).toEqual(READ)
})

test('a dotted grid inside a solid border is read as whole grid lines', async () => {
  expect(await importChart({ gridLines: 'dotted' })).toEqual(READ)
})

test('a grid drawn from thin filled rectangles is read like one drawn with lines', async () => {
  expect(await importChart({ gridLines: 'rectangles' })).toEqual(READ)
})

test('grid lines drawn as filled rectangles do not make an unstitched chart look like color blocks', async () => {
  const [chart] = await importChart({ grid: ['...', '...'], gridLines: 'rectangles' })

  expect(chart.importIssues.map(({ kind }) => kind)).not.toContain('no symbols')
})

test('cells taller than they are wide are read one symbol per cell', async () => {
  expect(await importChart({ cell: { width: 6, height: 14 } })).toEqual(READ)
})

test('cells wider than they are tall are read one symbol per cell', async () => {
  expect(await importChart({ cell: { width: 14, height: 6 } })).toEqual(READ)
})

test.each(['wide', 'doubled'] as const)(
  'thicker lines every 10 cells, drawn %s, are read as ordinary grid lines',
  async (thickLines) => {
    const grid = Array.from({ length: 11 }, (_, row) => (row % 2 ? '#^.' : '.^#').repeat(4))

    const [chart] = await importChart({ grid, thickLines })

    expect({ width: chart.width, height: chart.height, importIssues: chart.importIssues }).toEqual({
      width: 12,
      height: 11,
      importIssues: [],
    })
    expect(chart.cells.slice(0, 24)).toEqual([...'021021021021120120120120'].map(Number))
  },
)

test("a designer's logo below the grid is not read as part of the chart", async () => {
  expect(await importChart({ logo: true })).toEqual(READ)
})
