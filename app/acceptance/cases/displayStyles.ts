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

  test(
    'symbols are drawn as the source PDF prints them, and a built-in symbol stands in for an entry the chart never prints',
    { needs: ['import', 'symbol images'] },
    async ({ stitcher }) => {
      // The legend lists '^', which no stitch uses, so the PDF prints no cell to cut its symbol from.
      await stitcher.importsChart({
        grid: ['##', '#.'],
        legend: { '^': { threads: [{ thread: 'DMC 321', strands: 2 }] } },
      })

      await stitcher.seesSymbols({ asPrinted: 1, builtIn: 1 })
    },
  )
}
