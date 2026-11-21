// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { expect, test } from 'vitest'
import { openWorkspace, percentDone } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import { buildChartPdf } from '../support/chartPdf.ts'

/** A fresh in-memory database. Opening a second Workspace on the same one is like reloading the app. */
function inMemoryDatabase() {
  return { indexedDB: new IDBFactory(), IDBKeyRange }
}

function open(database = inMemoryDatabase()) {
  return openWorkspace({ readCharts: readChartsInProcess, database })
}

/** A chart PDF of one row: '#' a stitch, '.' a blank cell. */
function chartPdf(row: string) {
  return buildChartPdf({
    title: 'Winter Owl',
    fonts: { StitchSymbols: { glyphs: { 0x41: 'square' } } },
    symbols: { '#': { font: 'StitchSymbols', code: 0x41 } },
    pages: [
      { type: 'chart', cell: { width: 10, height: 10 }, grid: [row] },
      {
        type: 'legend',
        entries: [
          {
            symbol: '#',
            thread: { brand: 'DMC', code: '310' },
            name: 'Black',
            strands: 2,
            count: row.split('#').length - 1,
          },
        ],
      },
    ],
  })
}

/** A Workspace with one chart of `row`, and a project started on it. */
async function projectOn(row: string) {
  const workspace = await open()
  const chartId = await workspace.importPdf(chartPdf(row))
  const projectId = workspace.startProject(chartId)
  const progress = () => [...workspace.state.projects.get(projectId)!.progress]
  return { workspace, chartId, projectId, progress }
}

test('marking stitches already done adds nothing to undo', async () => {
  const { workspace, projectId, progress } = await projectOn('###')
  workspace.markCells(projectId, [0], true)

  workspace.markCells(projectId, [0], true)
  workspace.undo(projectId)

  expect(progress()).toEqual([0, 0, 0])
})

test('a project has something to undo after a mark, and something to redo after an undo, until a new mark', async () => {
  const { workspace, projectId } = await projectOn('###')
  expect([workspace.canUndo(projectId), workspace.canRedo(projectId)]).toEqual([false, false])

  workspace.markCells(projectId, [0], true)
  expect([workspace.canUndo(projectId), workspace.canRedo(projectId)]).toEqual([true, false])

  workspace.undo(projectId)
  expect([workspace.canUndo(projectId), workspace.canRedo(projectId)]).toEqual([false, true])

  workspace.markCells(projectId, [1], true)
  expect([workspace.canUndo(projectId), workspace.canRedo(projectId)]).toEqual([true, false])
})

test('a project starts on white fabric, and its fabric color is kept after reopening', async () => {
  const database = inMemoryDatabase()
  const before = await open(database)
  const projectId = before.startProject(await before.importPdf(chartPdf('###')))
  expect(before.state.projects.get(projectId)!.fabricColor).toBe('#ffffff')

  before.setFabricColor(projectId, '#f3e9d2')
  await before.whenSaved()

  expect((await open(database)).state.projects.get(projectId)!.fabricColor).toBe('#f3e9d2')
})

test('a chart with projects can’t be deleted, so no progress is lost', async () => {
  const { workspace, chartId } = await projectOn('###')
  const before = workspace.state

  expect(() => workspace.deleteChart(chartId)).toThrow('This chart has 1 project. Delete it first.')

  expect(workspace.state).toBe(before)
})

test('blank cells are never marked, and don’t count towards percent done', async () => {
  const { workspace, chartId, projectId, progress } = await projectOn('#.#')

  workspace.markCells(projectId, [0, 1], true)

  expect(progress()).toEqual([1, 0, 0])
  expect(percentDone(workspace.state.charts.get(chartId)!, workspace.state.projects.get(projectId)!)).toBe(50)
})

test('marking in a project that doesn’t exist is refused, without changing anything', async () => {
  const { workspace } = await projectOn('###')
  const before = workspace.state

  expect(() => workspace.markCells('no-such-project', [0], true)).toThrow('No such project')

  expect(workspace.state).toBe(before)
})

test('a project has a done color of its own, separate from its fabric, kept after reopening', async () => {
  const database = inMemoryDatabase()
  const before = await open(database)
  const projectId = before.startProject(await before.importPdf(chartPdf('###')))
  expect(before.state.projects.get(projectId)!.doneColor).toBe('#5bbf6a')

  before.setDoneColor(projectId, '#ff00aa')
  await before.whenSaved()

  const reopened = (await open(database)).state.projects.get(projectId)!
  expect(reopened.doneColor).toBe('#ff00aa')
  expect(reopened.fabricColor).toBe('#ffffff')
})
