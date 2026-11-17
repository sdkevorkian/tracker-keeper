import type { AcceptanceTest } from '../dsl/acceptanceTest.ts'

export default function importCases(test: AcceptanceTest) {
  test('importing a chart shows its size', { needs: ['import'] }, async ({ stitcher }) => {
    await stitcher.importsChart({ grid: ['#^.', '^##'] })

    await stitcher.seesChart({ width: 3, height: 2 })
  })

  test(
    'the app stays responsive while a large chart imports',
    { needs: ['import', 'responsiveness'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ size: { width: 200, height: 200 } })

      await stitcher.couldKeepUsingTheAppWhileItImported()
    },
  )

  test('a newly imported chart is shown whole', { needs: ['import', 'pan and zoom'] }, async ({ stitcher }) => {
    await stitcher.importsChart({ size: { width: 100, height: 100 } })

    await stitcher.seesStitches({ across: [1, 100], down: [1, 100] })
  })

  test(
    'a stitcher can zoom in on a chart and pan across it',
    { needs: ['import', 'pan and zoom'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ size: { width: 100, height: 100 } })

      await stitcher.zoomsIn()
      await stitcher.seesFewerStitchesThanBefore()

      await stitcher.dragsTheChartLeft()
      await stitcher.seesStitchesFurtherRightThanBefore()
    },
  )

  test(
    'panning and zooming stay smooth on a chart of 500 × 700 stitches',
    { needs: ['import', 'pan and zoom', 'responsiveness'], slow: true },
    async ({ stitcher }) => {
      await stitcher.importsChart({
        size: { width: 500, height: 700 },
        printedOn: { pagesAcross: 10, pagesDown: 10 },
        marginNumbers: true,
      })

      await stitcher.pansAndZoomsAroundTheChart()

      await stitcher.sawPanningAndZoomingStaySmooth()
    },
  )
}
