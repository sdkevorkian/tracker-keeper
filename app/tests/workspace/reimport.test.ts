// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { expect, test } from 'vitest'
import { openWorkspace, suggestCopyTitle } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import { buildChartPdf } from '../support/chartPdf.ts'

/** A fresh in-memory database. Opening a second Workspace on the same one is like reloading the app. */
function inMemoryDatabase() {
  return { indexedDB: new IDBFactory(), IDBKeyRange }
}

function open(database = inMemoryDatabase()) {
  return openWorkspace({ readCharts: readChartsInProcess, database })
}

/** A one-symbol chart PDF. Different titles make different source PDFs. */
function chartPdf(title: string) {
  return buildChartPdf({
    title,
    fonts: { StitchSymbols: { glyphs: { 0x41: 'square' } } },
    symbols: { '#': { font: 'StitchSymbols', code: 0x41 } },
    pages: [
      { type: 'chart', cell: { width: 10, height: 10 }, grid: ['#'] },
      {
        type: 'legend',
        entries: [{ symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 1 }],
      },
    ],
  })
}

test('a PDF imported before reports the charts that came from it, without adding any', async () => {
  const workspace = await open()
  const owlId = await workspace.importPdf(chartPdf('Winter Owl'))
  await workspace.importPdf(chartPdf('Autumn Fox'))
  const before = workspace.state

  expect(await workspace.importedBefore(chartPdf('Winter Owl'))).toEqual([owlId])

  expect(workspace.state).toBe(before)
})

test('a PDF never imported has no charts from it', async () => {
  const workspace = await open()
  await workspace.importPdf(chartPdf('Winter Owl'))

  expect(await workspace.importedBefore(chartPdf('Autumn Fox'))).toEqual([])
})

test('a separate copy has the title the stitcher gave it and its own ID, and shares the stored source PDF', async () => {
  const database = inMemoryDatabase()
  const before = await open(database)
  const pdf = chartPdf('Winter Owl')
  const owlId = await before.importPdf(pdf)

  const copyId = await before.importPdf(pdf, { titles: ['Winter Owl (2)'] })
  // The source PDF is kept once, so the copy still has it once the chart it was copied from is gone.
  before.deleteChart(owlId)
  await before.whenSaved()

  const reopened = await open(database)
  expect(copyId).not.toBe(owlId)
  expect(reopened.state.charts.get(copyId)!.title).toBe('Winter Owl (2)')
  expect(await reopened.sourcePdf(copyId)).toEqual(pdf)
})

test("a separate copy's suggested title is the chart's, numbered to tell it apart from every chart's title", async () => {
  const workspace = await open()
  await workspace.importPdf(chartPdf('Winter Owl'))

  expect(suggestCopyTitle(workspace.state, 'Winter Owl')).toBe('Winter Owl (2)')

  await workspace.importPdf(chartPdf('Winter Owl'), { titles: ['Winter Owl (2)'] })
  expect(suggestCopyTitle(workspace.state, 'Winter Owl')).toBe('Winter Owl (3)')
})

test("a separate copy of a chart with no title is suggested one, numbered like any other's", async () => {
  const workspace = await open()

  expect(suggestCopyTitle(workspace.state, undefined)).toBe('Untitled chart (2)')
})

test('a separate copy with a blank title is refused, and nothing is added', async () => {
  const workspace = await open()
  await workspace.importPdf(chartPdf('Winter Owl'))
  const before = workspace.state

  await expect(workspace.importPdf(chartPdf('Winter Owl'), { titles: ['  '] })).rejects.toThrow(
    "A chart's title can't be empty",
  )

  expect(workspace.state).toBe(before)
})
