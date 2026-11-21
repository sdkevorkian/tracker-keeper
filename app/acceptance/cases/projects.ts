import type { AcceptanceTest } from '../dsl/acceptanceTest.ts'

export default function projectCases(test: AcceptanceTest) {
  test(
    'a new project is named after its chart and listed under it on Your charts, 0% done',
    { needs: ['import', 'chart library', 'projects'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^.', '^##'], printedTitle: 'Winter Owl' })

      await stitcher.startsProject()
      await stitcher.goesToYourCharts()

      await stitcher.seesProjectsListed('Winter Owl', [{ name: 'Winter Owl', percentDone: 0 }])
    },
  )

  test(
    'marking a stitch done counts towards percent done, and marking it not done takes it back',
    { needs: ['import', 'projects'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['##', '^#'] })
      await stitcher.startsProject()

      await stitcher.marksStitchDone([1, 1])
      await stitcher.seesPercentDone(25)

      await stitcher.marksStitchNotDone([1, 1])
      await stitcher.seesPercentDone(0)
    },
  )

  test('a mark can be undone and redone', { needs: ['import', 'projects'] }, async ({ stitcher }) => {
    await stitcher.importsChart({ grid: ['##', '^#'] })
    await stitcher.startsProject()
    await stitcher.marksStitchDone([1, 1])
    await stitcher.marksStitchDone([2, 1])

    await stitcher.undoes()
    await stitcher.seesPercentDone(25)

    await stitcher.redoes()
    await stitcher.seesPercentDone(50)
  })

  test(
    'two projects on one chart keep their own progress',
    { needs: ['import', 'chart library', 'projects'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['##', '^#'], printedTitle: 'Winter Owl' })
      await stitcher.startsProject()
      await stitcher.renamesProject('First go')
      await stitcher.marksStitchDone([1, 1])

      await stitcher.goesToYourCharts()
      await stitcher.opensChart('Winter Owl')
      await stitcher.startsProject()
      await stitcher.seesPercentDone(0)

      await stitcher.goesToYourCharts()
      await stitcher.seesProjectsListed('Winter Owl', [
        { name: 'First go', percentDone: 25 },
        { name: 'Winter Owl', percentDone: 0 },
      ])
    },
  )

  test(
    "a project's name and progress are kept after reloading the app",
    { needs: ['import', 'chart library', 'projects', 'reload'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['##', '^#'], printedTitle: 'Winter Owl' })
      await stitcher.startsProject()
      await stitcher.renamesProject('First go')
      await stitcher.marksStitchDone([1, 1])
      await stitcher.marksStitchDone([2, 2])

      await stitcher.reloadsTheApp()
      await stitcher.goesToYourCharts()

      await stitcher.seesProjectsListed('Winter Owl', [{ name: 'First go', percentDone: 50 }])
    },
  )

  test(
    'dragging across a row marks the run of stitches done',
    { needs: ['import', 'projects'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['####', '####'] })
      await stitcher.startsProject()

      await stitcher.marksRunDone([1, 1], [4, 1])

      await stitcher.seesPercentDone(50)
    },
  )

  test(
    'the keyboard undoes and redoes a mark, and the Undo and Redo buttons show only when there is something to undo or redo',
    { needs: ['import', 'projects', 'undo buttons'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['##', '^#'] })
      await stitcher.startsProject()
      await stitcher.seesUndoAndRedoOffered({ undo: false, redo: false })

      await stitcher.marksStitchDone([1, 1])
      await stitcher.seesUndoAndRedoOffered({ undo: true, redo: false })

      await stitcher.undoes('keyboard')
      await stitcher.seesPercentDone(0)
      await stitcher.seesUndoAndRedoOffered({ undo: false, redo: true })

      await stitcher.redoes('keyboard')
      await stitcher.seesPercentDone(25)
    },
  )

  test(
    'the arrow keys move a cell cursor, which Space marks and Shift + arrows mark a run with',
    { needs: ['import', 'projects', 'cell cursor'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['####', '####'] })
      await stitcher.startsProject()
      await stitcher.tabsToTheChart()
      await stitcher.seesCursorOn([1, 1])

      await stitcher.movesCursor('right')
      await stitcher.seesCursorOn([2, 1])
      await stitcher.pressesSpace()
      await stitcher.seesPercentDone(12)

      await stitcher.movesCursor('down', { marking: true })
      await stitcher.seesCursorOn([2, 2])
      await stitcher.seesPercentDone(25)
    },
  )

  test(
    'the view scrolls to keep the cell cursor in sight',
    { needs: ['import', 'projects', 'cell cursor', 'view controls'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ size: { width: 100, height: 100 } })
      await stitcher.startsProject()
      await stitcher.tabsToTheChart()
      await stitcher.zoomsIn('keyboard')
      await stitcher.zoomsIn('keyboard')

      await stitcher.movesCursor('right', { times: 60 })

      await stitcher.seesCursorOn([61, 1])
      await stitcher.seesCursorInView()
    },
  )
}
