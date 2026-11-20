// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { expect, test } from 'vitest'
import { openWorkspace } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import { buildChartPdf } from '../support/chartPdf.ts'

/** A fresh in-memory database. Opening a second Workspace on the same one is like reloading the app. */
function inMemoryDatabase() {
  return { indexedDB: new IDBFactory(), IDBKeyRange }
}

/** Reads the database directly, since once its last chart is deleted nothing else can reach a source PDF. */
function storedSourcePdfCount({ indexedDB }: ReturnType<typeof inMemoryDatabase>) {
  return new Promise<number>((resolve, reject) => {
    const request = indexedDB.open('tracker-keeper')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const count = db.transaction('sourcePdfs').objectStore('sourcePdfs').count()
      count.onerror = () => reject(count.error)
      count.onsuccess = () => {
        db.close()
        resolve(count.result)
      }
    }
  })
}

function open(database: ReturnType<typeof inMemoryDatabase>) {
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

test('a deleted chart is gone, and other charts are untouched', async () => {
  const workspace = await open(inMemoryDatabase())
  const owlId = await workspace.importPdf(chartPdf('Winter Owl'))
  const foxId = await workspace.importPdf(chartPdf('Autumn Fox'))
  const fox = workspace.state.charts.get(foxId)

  workspace.deleteChart(owlId)

  expect([...workspace.state.charts.keys()]).toEqual([foxId])
  expect(workspace.state.charts.get(foxId)).toBe(fox)
})

test('a deleted chart is still gone after reopening', async () => {
  const database = inMemoryDatabase()
  const before = await open(database)
  const owlId = await before.importPdf(chartPdf('Winter Owl'))
  const foxId = await before.importPdf(chartPdf('Autumn Fox'))

  before.deleteChart(owlId)
  await before.whenSaved()

  expect([...(await open(database)).state.charts.keys()]).toEqual([foxId])
})

test('deleting the last chart from a source PDF removes the source PDF from storage', async () => {
  const database = inMemoryDatabase()
  const workspace = await open(database)
  const owlId = await workspace.importPdf(chartPdf('Winter Owl'))

  workspace.deleteChart(owlId)
  await workspace.whenSaved()

  expect(await storedSourcePdfCount(database)).toBe(0)
})

test('a source PDF another chart still uses is kept', async () => {
  const database = inMemoryDatabase()
  const before = await open(database)
  const pdf = chartPdf('Winter Owl')
  const firstId = await before.importPdf(pdf)
  const secondId = await before.importPdf(pdf)

  before.deleteChart(firstId)
  await before.whenSaved()

  expect(await (await open(database)).sourcePdf(secondId)).toEqual(pdf)
})

test('deleting a chart that does not exist is refused, without changing anything', async () => {
  const workspace = await open(inMemoryDatabase())
  const owlId = await workspace.importPdf(chartPdf('Winter Owl'))
  const before = workspace.state

  expect(() => workspace.deleteChart('no-such-chart')).toThrow('No such chart')

  expect(workspace.state).toBe(before)
  expect(workspace.state.charts.has(owlId)).toBe(true)
})
