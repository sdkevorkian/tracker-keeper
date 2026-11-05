import type { AcceptanceTest } from '../dsl/acceptanceTest.ts'

export default function pdfStyleCases(test: AcceptanceTest) {
  test(
    'a multi-page chart printed in two PDF styles imports as one chart',
    { needs: ['import', 'every chart'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({
        size: { width: 24, height: 20 },
        printedOn: { pagesAcross: 2, pagesDown: 2 },
        marginNumbers: true,
        printedIn: ['symbols', 'symbols on color'],
      })

      await stitcher.seesCharts([{ width: 24, height: 20 }])
    },
  )

  test(
    'a chart printed as color blocks and with symbols is read from the PDF style with symbols',
    { needs: ['import', 'every chart'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^.', '^##'], printedIn: ['color blocks', 'symbols'] })

      await stitcher.seesCharts([
        {
          width: 3,
          height: 2,
          legend: [
            { thread: 'DMC 310', stitches: 3 },
            { thread: 'DMC 321', stitches: 2 },
          ],
        },
      ])
    },
  )

  test(
    'a PDF holding two separate designs imports as two charts, each with its own legend',
    { needs: ['import', 'every chart'] },
    async ({ stitcher }) => {
      await stitcher.importsPdfOfDesigns([{ grid: ['##', '##'] }, { grid: ['^^^', '^.^'] }])

      await stitcher.seesCharts([
        { width: 2, height: 2, legend: [{ thread: 'DMC 310', stitches: 4 }] },
        { width: 3, height: 2, legend: [{ thread: 'DMC 321', stitches: 5 }] },
      ])
    },
  )

  test(
    'a chart printed only as color blocks gives an import issue saying it has no symbols to read',
    { needs: ['import', 'import issues'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^.', '^##'], printedIn: ['color blocks'] })

      await stitcher.seesImportIssues([{ kind: 'no symbols' }])
    },
  )
}
