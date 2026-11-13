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

/** Reads the database directly, since how many copies of a source PDF it holds is about storage itself. */
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

/** What a later version of the app might have saved: a higher schema version, with a store this one doesn't know. */
function saveAsNewerApp({ indexedDB }: ReturnType<typeof inMemoryDatabase>) {
  return new Promise<void>((resolve, reject) => {
    // Dexie keeps schema version n as IndexedDB version n × 10.
    const request = indexedDB.open('tracker-keeper', 20)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of ['sourcePdfs', 'charts', 'projects']) db.createObjectStore(name)
      db.createObjectStore('threadStash').put({ thread: 'DMC 310', skeins: 2 }, 'DMC 310')
    }
    request.onsuccess = () => {
      request.result.close()
      resolve()
    }
  })
}

/** The database's version, stores and every record, read directly. */
function snapshot({ indexedDB }: ReturnType<typeof inMemoryDatabase>) {
  return new Promise<unknown>((resolve, reject) => {
    const request = indexedDB.open('tracker-keeper')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const names = [...db.objectStoreNames]
      const transaction = db.transaction(names)
      const records = names.map((name) => transaction.objectStore(name).getAll())
      transaction.oncomplete = () => {
        db.close()
        resolve({ version: db.version, stores: Object.fromEntries(names.map((name, i) => [name, records[i].result])) })
      }
      transaction.onerror = () => reject(transaction.error)
    }
  })
}

function open(database: ReturnType<typeof inMemoryDatabase>) {
  return openWorkspace({ readCharts: readChartsInProcess, database })
}

const chartPdf = buildChartPdf({
  title: 'Autumn Fox',
  fonts: { StitchSymbols: { glyphs: { 0x41: 'square', 0x42: 'triangle' } } },
  symbols: { '#': { font: 'StitchSymbols', code: 0x41 }, '^': { font: 'StitchSymbols', code: 0x42 } },
  pages: [
    { type: 'chart', cell: { width: 10, height: 10 }, grid: ['#^.', '^##'] },
    {
      type: 'legend',
      entries: [
        { symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 3 },
        // A wrong count, so the chart has an import issue to keep.
        { symbol: '^', thread: { brand: 'DMC', code: '321' }, name: 'Red', strands: 2, count: 5 },
      ],
    },
  ],
})

test('an imported chart reads back identically through a new Workspace on the same database', async () => {
  const database = inMemoryDatabase()
  const before = await open(database)
  const chartId = await before.importPdf(chartPdf)
  await before.whenSaved()

  const after = await open(database)

  expect(after.state.charts.get(chartId)).toEqual(before.state.charts.get(chartId))
})

test('a change made through a command is saved', async () => {
  const database = inMemoryDatabase()
  const before = await open(database)
  const chartId = await before.importPdf(chartPdf)

  before.renameChart(chartId, 'Fox in Leaves')
  await before.whenSaved()

  expect((await open(database)).state.charts.get(chartId)!.title).toBe('Fox in Leaves')
})

test("a chart's source PDF can still be read after reopening", async () => {
  const database = inMemoryDatabase()
  const before = await open(database)
  const chartId = await before.importPdf(chartPdf)
  await before.whenSaved()

  const after = await open(database)

  expect(await after.sourcePdf(chartId)).toEqual(chartPdf)
})

test('importing the same PDF twice stores the source PDF once', async () => {
  const database = inMemoryDatabase()
  const workspace = await open(database)

  await workspace.importPdf(chartPdf)
  await workspace.importPdf(chartPdf)
  await workspace.whenSaved()

  expect(await storedSourcePdfCount(database)).toBe(1)
})

test('data saved by a newer version of the app is refused and left as it was', async () => {
  const database = inMemoryDatabase()
  await saveAsNewerApp(database)
  const before = await snapshot(database)

  await expect(open(database)).rejects.toThrow(/newer version of tracker-keeper/)

  expect(await snapshot(database)).toEqual(before)
})
