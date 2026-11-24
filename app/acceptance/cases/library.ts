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
    'a renamed chart is listed by its new title, also after a reload',
    { needs: ['import', 'reload', 'chart library', 'rename charts'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^.', '^##'], printedTitle: 'Winter Owl' })
      await stitcher.importsChart({ grid: ['#^'], printedTitle: 'Autumn Fox' })
      await stitcher.goesToYourCharts()

      await stitcher.renamesChart('Winter Owl', 'Snowy Owl')

      await stitcher.seesChartsListed(['Autumn Fox', 'Snowy Owl'])
      await stitcher.reloadsTheApp()
      await stitcher.seesChartsListed(['Autumn Fox', 'Snowy Owl'])
    },
  )

  test(
    'a chart can be renamed from its own page',
    { needs: ['import', 'chart library', 'rename charts'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^'], printedTitle: 'Winter Owl' })

      await stitcher.renamesChart('Winter Owl', 'Snowy Owl', { from: 'its page' })

      await stitcher.goesToYourCharts()
      await stitcher.seesChartsListed(['Snowy Owl'])
    },
  )

  test(
    'a deleted chart is gone from Your charts, also after a reload',
    { needs: ['import', 'reload', 'chart library', 'delete charts'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^.', '^##'], printedTitle: 'Winter Owl' })
      await stitcher.importsChart({ grid: ['#^'], printedTitle: 'Autumn Fox' })
      await stitcher.goesToYourCharts()

      await stitcher.deletesChart('Winter Owl')

      await stitcher.seesChartsListed(['Autumn Fox'])
      await stitcher.reloadsTheApp()
      await stitcher.seesChartsListed(['Autumn Fox'])
    },
  )

  test(
    "deleting a chart from its own page goes back to Your charts, where it isn't listed",
    { needs: ['import', 'chart library', 'delete charts'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^'], printedTitle: 'Autumn Fox' })
      await stitcher.importsChart({ grid: ['#^.', '^##'], printedTitle: 'Winter Owl' })

      await stitcher.deletesChart('Winter Owl', { from: 'its page' })

      await stitcher.seesChartsListed(['Autumn Fox'])
    },
  )

  test(
    'deleting a chart asks first, naming it and warning its corrections will be lost, and cancelling keeps it',
    { needs: ['import', 'chart library', 'delete confirmation'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^.', '^##'], printedTitle: 'Winter Owl' })
      await stitcher.importsChart({ grid: ['#^'], printedTitle: 'Autumn Fox' })
      await stitcher.goesToYourCharts()

      await stitcher.startsDeletingChart('Winter Owl')

      await stitcher.isAskedToConfirmDeleting('Winter Owl', { losing: 'corrections' })
      await stitcher.cancelsDeleting()
      await stitcher.seesChartsListed(['Autumn Fox', 'Winter Owl'])
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

  test(
    're-importing a PDF names the charts already imported from it, and opening one adds no chart',
    { needs: ['import', 'chart library', 'imported before'] },
    async ({ stitcher }) => {
      const owl = { grid: ['#^.', '^##'], printedTitle: 'Winter Owl' }
      await stitcher.importsChart(owl)
      await stitcher.importsChart({ grid: ['#^'], printedTitle: 'Autumn Fox' })

      await stitcher.importsTheSamePdfAgain(owl)

      await stitcher.isToldItWasImportedBefore(['Winter Owl'])
      await stitcher.opensChartImportedBefore('Winter Owl')
      await stitcher.seesChart({ width: 3, height: 2 })
      await stitcher.goesToYourCharts()
      await stitcher.seesChartsListed(['Autumn Fox', 'Winter Owl'])
    },
  )

  test(
    'a separate copy of a PDF imported before is suggested a title that tells it apart',
    { needs: ['import', 'chart library', 'imported before'] },
    async ({ stitcher }) => {
      const owl = { grid: ['#^.', '^##'], printedTitle: 'Winter Owl' }
      await stitcher.importsChart(owl)
      await stitcher.importsTheSamePdfAgain(owl)

      await stitcher.importsSeparateCopy()

      await stitcher.seesChart({ width: 3, height: 2 })
      await stitcher.goesToYourCharts()
      await stitcher.seesChartsListed(['Winter Owl', 'Winter Owl (2)'])
    },
  )

  test(
    'a separate copy takes the title the stitcher gives it',
    { needs: ['import', 'chart library', 'imported before'] },
    async ({ stitcher }) => {
      const owl = { grid: ['#^.', '^##'], printedTitle: 'Winter Owl' }
      await stitcher.importsChart(owl)
      await stitcher.importsTheSamePdfAgain(owl)

      await stitcher.importsSeparateCopy({ titled: 'Snowy Owl' })

      await stitcher.goesToYourCharts()
      await stitcher.seesChartsListed(['Snowy Owl', 'Winter Owl'])
    },
  )

  test(
    'cancelling the import of a PDF imported before adds nothing',
    { needs: ['import', 'chart library', 'imported before'] },
    async ({ stitcher }) => {
      const owl = { grid: ['#^.', '^##'], printedTitle: 'Winter Owl' }
      await stitcher.importsChart(owl)
      await stitcher.importsTheSamePdfAgain(owl)

      await stitcher.cancelsImport()

      await stitcher.goesToYourCharts()
      await stitcher.seesChartsListed(['Winter Owl'])
    },
  )
}
