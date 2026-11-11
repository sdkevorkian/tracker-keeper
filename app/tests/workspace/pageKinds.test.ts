// @vitest-environment node
// Which pages of a source PDF are chart pages, when other pages rule grids of their own.
import { expect, test } from 'vitest'
import { createWorkspace } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import { buildChartPdf, type PageDescription } from '../support/chartPdf.ts'

async function importPdf(pages: PageDescription[]) {
  const workspace = createWorkspace({ readCharts: readChartsInProcess })
  await workspace.importPdf(
    buildChartPdf({
      fonts: { StitchSymbols: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSymbols', code: 0x41 } },
      pages,
    }),
  )
  return [...workspace.state.charts.values()].map(({ width, height, legend }) => ({
    width,
    height,
    legend: legend.length,
  }))
}

const LEGEND: PageDescription = {
  type: 'legend',
  entries: [{ symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 4 }],
}

test('an empty ruled box, such as a table left blank for notes, is not a chart page', async () => {
  const notes: PageDescription = {
    type: 'table',
    cell: { width: 100, height: 16 },
    rows: [
      ['', '', ''],
      ['', '', ''],
    ],
  }

  expect(
    await importPdf([{ type: 'chart', cell: { width: 10, height: 10 }, grid: ['##', '##'] }, LEGEND, notes]),
  ).toEqual([{ width: 2, height: 2, legend: 1 }])
})

test('a page of a chart with nothing stitched on it is still a chart page when its margins number it', async () => {
  // Two pages across; the right one is blank.
  const grid = Array.from({ length: 10 }, (_, row) => (row < 2 ? '##' : '..').padEnd(20, '.'))

  expect(
    await importPdf([
      {
        type: 'chart',
        cell: { width: 10, height: 10 },
        grid,
        pageSize: { width: 10, height: 10 },
        marginNumbers: true,
      },
      LEGEND,
    ]),
  ).toEqual([{ width: 20, height: 10, legend: 1 }])
})
