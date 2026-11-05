// @vitest-environment node
import { expect, test } from 'vitest'
import { createWorkspace } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import { buildChartPdf, type PageDescription } from '../support/chartPdf.ts'

const chart: PageDescription = { type: 'chart', cell: { width: 10, height: 10 }, grid: ['#'] }
const legend: PageDescription = {
  type: 'legend',
  entries: [{ symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 1 }],
}

/** Imports a one-symbol chart and returns its title. */
async function importedTitle({ metadata, pages = [] }: { metadata?: string; pages?: PageDescription[] }) {
  const workspace = createWorkspace({ readCharts: readChartsInProcess })
  const chartId = await workspace.importPdf(
    buildChartPdf({
      title: metadata,
      fonts: { StitchSymbols: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSymbols', code: 0x41 } },
      pages: [chart, legend, ...pages],
    }),
  )
  return workspace.state.charts.get(chartId)!.title
}

test("a chart with no printed title takes the title in its source PDF's metadata", async () => {
  expect(await importedTitle({ metadata: 'Autumn Fox' })).toBe('Autumn Fox')
})

test('a placeholder title in the metadata, such as "document", is no title', async () => {
  for (const metadata of ['document', 'Untitled', '  ']) {
    expect(await importedTitle({ metadata })).toBeUndefined()
  }
})

test("a title printed on an info page wins over the metadata's", async () => {
  const infoPage: PageDescription = {
    type: 'table',
    cell: { width: 100, height: 16 },
    rows: [['Title', 'Autumn Fox']],
  }

  expect(await importedTitle({ metadata: 'fox_final_v2', pages: [infoPage] })).toBe('Autumn Fox')
})

test('a stitcher can rename a chart, replacing the title from its source PDF', async () => {
  const workspace = createWorkspace({ readCharts: readChartsInProcess })
  const chartId = await workspace.importPdf(
    buildChartPdf({
      title: 'fox_final_v2',
      fonts: { StitchSymbols: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSymbols', code: 0x41 } },
      pages: [chart, legend],
    }),
  )
  const heard: (string | undefined)[] = []
  workspace.subscribe((state) => heard.push(state.charts.get(chartId)!.title))

  workspace.renameChart(chartId, 'Autumn Fox')

  expect(workspace.state.charts.get(chartId)!.title).toBe('Autumn Fox')
  expect(heard).toEqual(['Autumn Fox'])
})
