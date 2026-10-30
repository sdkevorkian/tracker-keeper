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
}
