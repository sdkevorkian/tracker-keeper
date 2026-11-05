// @vitest-environment node
import { expect, test } from 'vitest'
import { createWorkspace } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import { buildChartPdf, type LegendEntry, type PageDescription } from '../support/chartPdf.ts'

async function importChart(chart: PageDescription, entries: LegendEntry[]) {
  const workspace = createWorkspace({ readCharts: readChartsInProcess })
  const chartId = await workspace.importPdf(
    buildChartPdf({
      fonts: { StitchSymbols: { glyphs: { 0x41: 'square', 0x42: 'triangle', 0x43: 'square' } } },
      symbols: {
        '#': { font: 'StitchSymbols', code: 0x41 },
        '^': { font: 'StitchSymbols', code: 0x42 },
        '@': { font: 'StitchSymbols', code: 0x43 },
      },
      pages: [chart, { type: 'legend', entries }],
    }),
  )
  return workspace.state.charts.get(chartId)!
}

const black: LegendEntry = { symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 2 }

test('a legend entry with no stitches is reported as that, not as a count mismatch', async () => {
  const chart = await importChart({ type: 'chart', cell: { width: 10, height: 10 }, grid: ['##'] }, [
    black,
    { symbol: '^', thread: { brand: 'DMC', code: '321' }, name: 'Red', strands: 2, count: 5 },
  ])

  expect(chart.importIssues).toEqual([{ kind: 'legend entry with no stitches', entry: 2 }])
})

test("a DMC thread keeps the bundled color even when the legend's swatch differs", async () => {
  const chart = await importChart({ type: 'chart', cell: { width: 10, height: 10 }, grid: ['##'] }, [
    { ...black, swatch: '#202020' },
  ])

  // From craft-color-codes' dmc-floss.json.
  expect(chart.legend[0].color).toBe('#000000')
})

test("a blend's color is its legend swatch's", async () => {
  const chart = await importChart({ type: 'chart', cell: { width: 10, height: 10 }, grid: ['#'] }, [
    {
      symbol: '#',
      threads: [
        { thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 1 },
        { thread: { brand: 'DMC', code: '3371' }, name: 'Black Brown', strands: 1 },
      ],
      count: 1,
      swatch: '#1B1410',
    },
  ])

  expect(chart.legend[0].color).toBe('#1B1410')
})

test('a symbol missing from the legend on stitches two pages repeat names each of its cells once', async () => {
  // Two pages side by side; the second repeats columns 3 and 4.
  const chart = await importChart(
    {
      type: 'chart',
      cell: { width: 10, height: 10 },
      grid: ['#@#@##', '##@###', '@#####'],
      pageSize: { width: 4, height: 3 },
      overlap: 2,
    },
    [{ ...black, count: 14 }],
  )

  expect(chart.importIssues).toEqual([
    { kind: 'symbol not in legend', symbol: { font: 'StitchSymbols', code: 0x43 }, cells: [1, 3, 8, 12] },
  ])
})
