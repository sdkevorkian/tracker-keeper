import type { AcceptanceTest } from '../dsl/acceptanceTest.ts'

export default function viewControlCases(test: AcceptanceTest) {
  test('the zoom buttons zoom in and out', { needs: ['import', 'view controls'] }, async ({ stitcher }) => {
    await stitcher.importsChart({ size: { width: 100, height: 100 } })

    await stitcher.zoomsIn('buttons')
    await stitcher.seesFewerStitchesThanBefore()

    await stitcher.zoomsOut('buttons')
    await stitcher.seesMoreStitchesThanBefore()
  })

  test(
    'Fit shows the whole chart again after zooming',
    { needs: ['import', 'view controls'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ size: { width: 100, height: 100 } })
      await stitcher.zoomsIn('buttons')

      await stitcher.fitsTheChart('buttons')

      await stitcher.seesStitches({ across: [1, 100], down: [1, 100] })
    },
  )

  test(
    'the chart can be reached with Tab and shows a focus ring',
    { needs: ['import', 'view controls'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ size: { width: 100, height: 100 } })

      await stitcher.tabsToTheChart()

      await stitcher.seesTheChartFocused()
    },
  )

  test('the keyboard zooms, pans and fits the chart', { needs: ['import', 'view controls'] }, async ({ stitcher }) => {
    await stitcher.importsChart({ size: { width: 100, height: 100 } })
    await stitcher.tabsToTheChart()

    await stitcher.zoomsIn('keyboard')
    await stitcher.seesFewerStitchesThanBefore()

    await stitcher.pansRight('keyboard')
    await stitcher.seesStitchesFurtherRightThanBefore()

    await stitcher.fitsTheChart('keyboard')
    await stitcher.seesStitches({ across: [1, 100], down: [1, 100] })
  })

  test(
    'a two-finger trackpad scroll pans the chart, and a pinch zooms it',
    { needs: ['import', 'pan and zoom'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ size: { width: 100, height: 100 } })

      await stitcher.zoomsIn('pointer')
      await stitcher.seesFewerStitchesThanBefore()

      await stitcher.pansRight('pointer')
      await stitcher.seesStitchesFurtherRightThanBefore()
    },
  )

  test(
    'on a touchscreen, two fingers pinch-zoom the chart and one finger pans it',
    { needs: ['import', 'pan and zoom'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ size: { width: 100, height: 100 } })

      await stitcher.zoomsIn('touch')
      await stitcher.seesFewerStitchesThanBefore()

      await stitcher.pansRight('touch')
      await stitcher.seesStitchesFurtherRightThanBefore()
    },
  )
}
