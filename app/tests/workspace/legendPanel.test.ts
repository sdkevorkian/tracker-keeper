// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { expect, test } from 'vitest'
import { openWorkspace, stitchesLeft } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import { buildChartPdf } from '../support/chartPdf.ts'

/** A fresh in-memory database. Opening a second Workspace on the same one is like reloading the app. */
function inMemoryDatabase() {
  return { indexedDB: new IDBFactory(), IDBKeyRange }
}

function open(database = inMemoryDatabase()) {
  return openWorkspace({ readCharts: readChartsInProcess, database })
}

/** A chart PDF of one row: '#' is DMC 310, '^' DMC 321, '.' a blank cell. */
function chartPdf(row: string) {
  const count = (symbol: string) => row.split(symbol).length - 1
  return buildChartPdf({
    title: 'Winter Owl',
    fonts: { StitchSymbols: { glyphs: { 0x41: 'square', 0x42: 'triangle' } } },
    symbols: { '#': { font: 'StitchSymbols', code: 0x41 }, '^': { font: 'StitchSymbols', code: 0x42 } },
    pages: [
      { type: 'chart', cell: { width: 10, height: 10 }, grid: [row] },
      {
        type: 'legend',
        entries: [
          { symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: count('#') },
          { symbol: '^', thread: { brand: 'DMC', code: '321' }, name: 'Red', strands: 2, count: count('^') },
        ],
      },
    ],
  })
}

test('each legend entry has as many stitches left as it has stitches not yet marked done', async () => {
  const workspace = await open()
  const chartId = await workspace.importPdf(chartPdf('##^.#^'))
  const projectId = workspace.startProject(chartId)
  const left = () => stitchesLeft(workspace.state.charts.get(chartId)!, workspace.state.projects.get(projectId)!)
  expect(left()).toEqual([3, 2])

  workspace.markCells(projectId, [0, 2, 3], true)
  expect(left()).toEqual([2, 1])

  workspace.markCells(projectId, [2], false)
  expect(left()).toEqual([2, 2])
})

test('each project keeps its own display style, also after reopening', async () => {
  const database = inMemoryDatabase()
  const before = await open(database)
  const chartId = await before.importPdf(chartPdf('#^'))
  const symbolsOnly = before.startProject(chartId)
  const colorBlocks = before.startProject(chartId)

  before.setDisplayStyle(symbolsOnly, 'symbols only')
  before.setDisplayStyle(colorBlocks, 'color blocks')
  await before.whenSaved()

  const { projects } = (await open(database)).state
  expect(projects.get(symbolsOnly)!.displayStyle).toBe('symbols only')
  expect(projects.get(colorBlocks)!.displayStyle).toBe('color blocks')
})

test('a new project starts in the display style used most recently, also after reopening', async () => {
  const database = inMemoryDatabase()
  const before = await open(database)
  const chartId = await before.importPdf(chartPdf('#^'))
  before.setDisplayStyle(before.startProject(chartId), 'color blocks')
  before.setDisplayStyle(before.startProject(chartId), 'symbols only')
  await before.whenSaved()

  const reopened = await open(database)
  const started = reopened.startProject(chartId)

  expect(reopened.state.projects.get(started)!.displayStyle).toBe('symbols only')
})
