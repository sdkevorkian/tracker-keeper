// @vitest-environment node
// The comparison over the committed real-chart fixtures (see tests/fixtures/charts/README.md).
// A fixture with no expected output yet is skipped; `npm run compare-charts -- tests/fixtures/charts --update` records one.
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { compareChart, expectedOutputName } from './compareCharts.ts'

const fixtures = fileURLToPath(new URL('../fixtures/charts/', import.meta.url))
const pdfs = readdirSync(fixtures).filter((name) => name.toLowerCase().endsWith('.pdf'))

for (const pdf of pdfs.sort()) {
  const recorded = existsSync(join(fixtures, expectedOutputName(pdf)))
  test.skipIf(!recorded)(`${pdf} imports as its expected output`, async () => {
    const result = await compareChart(fixtures, pdf)
    expect(result.outcome === 'differs' ? result.differences : []).toEqual([])
    expect(result.outcome).toBe('matches')
  })
}
