import type { AcceptanceTest } from '../dsl/acceptanceTest.ts'

export default function multiPageCases(test: AcceptanceTest) {
  test(
    'a chart printed on 2 × 2 pages with margin numbers imports as one chart',
    { needs: ['import'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({
        size: { width: 24, height: 24 },
        printedOn: { pagesAcross: 2, pagesDown: 2 },
        marginNumbers: true,
      })

      await stitcher.seesChart({ width: 24, height: 24 })
    },
  )

  test(
    'a chart whose pages repeat rows and columns, with no margin numbers, joins to its full size',
    { needs: ['import'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({
        size: { width: 20, height: 16 },
        printedOn: { pagesAcross: 2, pagesDown: 2 },
        overlap: 2,
      })

      await stitcher.seesChart({ width: 20, height: 16 })
    },
  )

  test(
    "a printed size that doesn't match the parsed size gives a size import issue",
    { needs: ['import', 'import issues'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ size: { width: 20, height: 16 }, printedSize: { width: 22, height: 16 } })

      await stitcher.seesImportIssues([
        { kind: 'size mismatch', printed: { width: 22, height: 16 }, parsed: { width: 20, height: 16 } },
      ])
    },
  )

  test(
    'a printed size that matches the parsed size gives no size import issue',
    { needs: ['import', 'import issues'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ size: { width: 20, height: 16 }, printedSize: { width: 20, height: 16 } })

      await stitcher.seesNoImportIssues()
    },
  )

  test("each page's place in the chart is kept", { needs: ['import', 'source pages'] }, async ({ stitcher }) => {
    await stitcher.importsChart({
      size: { width: 24, height: 20 },
      printedOn: { pagesAcross: 2, pagesDown: 2 },
      marginNumbers: true,
    })

    await stitcher.seesSourcePagesPlaced([
      { page: 1, across: [1, 12], down: [1, 10] },
      { page: 2, across: [13, 24], down: [1, 10] },
      { page: 3, across: [1, 12], down: [11, 20] },
      { page: 4, across: [13, 24], down: [11, 20] },
    ])
  })
}
