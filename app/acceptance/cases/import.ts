import type { AcceptanceTest } from '../dsl/acceptanceTest.ts'

export default function importCases(test: AcceptanceTest) {
  test('importing a chart shows its size', { needs: ['import'] }, async ({ stitcher }) => {
    await stitcher.importsChart({ grid: ['#^.', '^##'] })

    await stitcher.seesChart({ width: 3, height: 2 })
  })
}
