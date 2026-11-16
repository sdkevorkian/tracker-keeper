import type { AcceptanceTest } from '../dsl/acceptanceTest.ts'

export default function displayStyleCases(test: AcceptanceTest) {
  test('a chart opens in color with symbols', { needs: ['import', 'display styles'] }, async ({ stitcher }) => {
    await stitcher.importsChart({ grid: ['#^', '^#'] })

    await stitcher.seesDisplayStyle('color with symbols')
  })

  test(
    'switching display style changes how the chart is drawn, never the chart',
    { needs: ['import', 'display styles'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^.', '^#^'] })

      for (const style of ['symbols only', 'color blocks', 'color with symbols'] as const) {
        await stitcher.switchesDisplayStyle(style)

        await stitcher.seesDisplayStyle(style)
        await stitcher.seesChart({ width: 3, height: 2 })
        await stitcher.seesStitches({ across: [1, 3], down: [1, 2] })
      }
    },
  )
}
