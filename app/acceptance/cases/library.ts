import type { AcceptanceTest } from '../dsl/acceptanceTest.ts'

export default function libraryCases(test: AcceptanceTest) {
  test(
    'reloading the app keeps imported charts, listed on the Your charts page',
    { needs: ['import', 'reload', 'chart library'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^.', '^##'], printedTitle: 'Winter Owl' })
      await stitcher.importsChart({ size: { width: 4, height: 5 }, printedTitle: 'Autumn Fox' })

      await stitcher.reloadsTheApp()
      await stitcher.goesToYourCharts()

      await stitcher.seesChartsListed(['Autumn Fox', 'Winter Owl'])
      await stitcher.opensChart('Winter Owl')
      await stitcher.seesChart({ width: 3, height: 2 })
    },
  )

  test(
    "reloading a chart's page shows the same chart",
    { needs: ['import', 'reload', 'chart pages'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^.', '^##'] })

      await stitcher.reloadsTheApp()

      await stitcher.seesChart({ width: 3, height: 2 })
    },
  )
}
