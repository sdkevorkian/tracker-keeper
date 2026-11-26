import type { AcceptanceTest } from '../dsl/acceptanceTest.ts'

export default function legendPanelCases(test: AcceptanceTest) {
  test(
    "a project's legend panel lists each entry's stitches left, and marking a stitch takes it off",
    { needs: ['import', 'projects', 'legend panel'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['##', '^#'] })
      await stitcher.startsProject()
      await stitcher.seesStitchesLeft({ 'DMC 310': 3, 'DMC 321': 1 })

      await stitcher.marksStitchDone([1, 1])
      await stitcher.seesStitchesLeft({ 'DMC 310': 2, 'DMC 321': 1 })

      await stitcher.marksStitchNotDone([1, 1])
      await stitcher.seesStitchesLeft({ 'DMC 310': 3, 'DMC 321': 1 })
    },
  )

  test(
    'each project keeps its display style after a reload, and a new project starts in the one used last',
    { needs: ['import', 'reload', 'chart library', 'projects', 'project display styles'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^'], printedTitle: 'Winter Owl' })
      await stitcher.startsProject()
      await stitcher.renamesProject('First go')
      await stitcher.switchesDisplayStyle('symbols only')
      await stitcher.goesToYourCharts()
      await stitcher.opensChart('Winter Owl')
      await stitcher.startsProject()
      await stitcher.renamesProject('Second go')
      await stitcher.switchesDisplayStyle('color blocks')

      await stitcher.reloadsTheApp()

      await stitcher.goesToYourCharts()
      await stitcher.opensProject('First go')
      await stitcher.seesDisplayStyle('symbols only')
      await stitcher.goesToYourCharts()
      await stitcher.opensChart('Winter Owl')
      await stitcher.startsProject()
      await stitcher.seesDisplayStyle('color blocks')
    },
  )

  test(
    'a legend entry is highlighted from the keyboard, and pressing it again or Escape clears it',
    { needs: ['import', 'projects', 'legend panel', 'highlight'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['##', '^#'] })
      await stitcher.startsProject()

      await stitcher.tabsToLegendEntry('DMC 321')
      await stitcher.pressesKey('Enter')
      await stitcher.seesHighlighted('DMC 321')

      await stitcher.pressesKey('Enter')
      await stitcher.seesNothingHighlighted()

      await stitcher.pressesKey('Enter')
      await stitcher.pressesKey('Escape')
      await stitcher.seesNothingHighlighted()
    },
  )
}
