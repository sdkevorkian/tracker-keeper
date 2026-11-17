// @vitest-environment node
import { expect, test } from 'vitest'
import { createWorkspace } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import { buildChartPdf, type LegendEntry, type PageDescription } from '../support/chartPdf.ts'

async function importChart(chartPages: PageDescription[], entries: LegendEntry[]) {
  const workspace = createWorkspace({ readCharts: readChartsInProcess })
  const chartId = await workspace.importPdf(
    buildChartPdf({
      fonts: { StitchSymbols: { glyphs: { 0x41: 'square', 0x42: 'triangle' } } },
      symbols: { '#': { font: 'StitchSymbols', code: 0x41 }, '^': { font: 'StitchSymbols', code: 0x42 } },
      pages: [...chartPages, { type: 'legend', entries }],
    }),
  )
  return workspace.state.charts.get(chartId)!
}

const black: LegendEntry = { symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 2 }
const red: LegendEntry = { symbol: '^', thread: { brand: 'DMC', code: '321' }, name: 'Red', strands: 2, count: 1 }

// The builder prints a chart's grid from 36 points in from the page's left and top, on a 612 × 792 point page.

test('each legend entry keeps the first cell the source PDF prints its symbol in, so it can be shown as printed', async () => {
  const chart = await importChart(
    [{ type: 'chart', cell: { width: 10, height: 10 }, grid: ['.#', '^#'] }],
    [black, red],
  )

  expect(chart.legend.map(({ example }) => example)).toEqual([
    { page: 1, box: { x0: 46, y0: 746, x1: 56, y1: 756 } },
    { page: 1, box: { x0: 36, y0: 736, x1: 46, y1: 746 } },
  ])
})

test("a symbol first printed on a later page of a multi-page chart keeps that page's cell", async () => {
  // 24 × 10 stitches, printed 12 across to a page: '^' is printed only at the top left of page 2.
  // Ten rows, so the margins number both pages and they join.
  const grid = ['#'.repeat(12) + '^' + '#'.repeat(11), ...Array<string>(9).fill('#'.repeat(24))]
  const chart = await importChart(
    [
      {
        type: 'chart',
        cell: { width: 10, height: 10 },
        grid,
        pageSize: { width: 12, height: 10 },
        marginNumbers: true,
      },
    ],
    [{ ...black, count: 239 }, red],
  )

  expect(chart.legend[1].example).toEqual({ page: 2, box: { x0: 36, y0: 746, x1: 46, y1: 756 } })
})

test('a legend entry the chart never prints has no example cell, so a built-in symbol stands in for it', async () => {
  const chart = await importChart([{ type: 'chart', cell: { width: 10, height: 10 }, grid: ['##'] }], [black, red])

  expect(chart.legend[1].example).toBeUndefined()
})
