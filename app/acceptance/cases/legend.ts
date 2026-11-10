import type { AcceptanceTest } from '../dsl/acceptanceTest.ts'

export default function legendCases(test: AcceptanceTest) {
  test(
    'a blend is read as one legend entry with two threads and their strands',
    { needs: ['import', 'legend'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({
        grid: ['#^', '^^'],
        legend: {
          '#': {
            threads: [
              { thread: 'DMC 310', strands: 1 },
              { thread: 'DMC 3371', strands: 1 },
            ],
          },
        },
      })

      await stitcher.seesLegend([
        {
          threads: [
            { thread: 'DMC 310', name: 'Black', strands: 1 },
            { thread: 'DMC 3371', name: 'Black Brown', strands: 1 },
          ],
          printedStitches: 1,
        },
        { threads: [{ thread: 'DMC 321', name: 'Red', strands: 2 }], printedStitches: 3 },
      ])
    },
  )

  test("each legend entry's printed stitch count is read", { needs: ['import', 'legend'] }, async ({ stitcher }) => {
    await stitcher.importsChart({ grid: ['###', '#^.'] })

    await stitcher.seesLegend([
      { threads: [{ thread: 'DMC 310', name: 'Black', strands: 2 }], printedStitches: 4 },
      { threads: [{ thread: 'DMC 321', name: 'Red', strands: 2 }], printedStitches: 1 },
    ])
  })

  test(
    'a legend with headings in Russian and English is read',
    { needs: ['import', 'legend'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({
        grid: ['#^', '^^'],
        legendHeadings: [
          { symbol: 'Символ', brand: 'Номер', name: 'Название', strands: 'Нитей', count: 'Крестиков' },
          { symbol: 'Symbol', brand: 'Number', name: 'Name', strands: 'Strands', count: 'Stitches' },
        ],
      })

      await stitcher.seesLegend([
        { threads: [{ thread: 'DMC 310', name: 'Black', strands: 2 }], printedStitches: 1 },
        { threads: [{ thread: 'DMC 321', name: 'Red', strands: 2 }], printedStitches: 3 },
      ])
    },
  )

  test(
    "threads from other brands are kept as written, colored by the legend's swatch if it prints one",
    { needs: ['import', 'legend'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({
        grid: ['#^', '^^'],
        legend: {
          '#': { threads: [{ thread: 'Anchor 403', strands: 2 }], swatch: '#1E1E1E' },
          '^': { threads: [{ thread: 'Cosmo 2500', strands: 2 }] },
        },
      })

      await stitcher.seesLegend([
        { threads: [{ thread: 'Anchor 403', name: 'Black', strands: 2 }], printedStitches: 1, color: '#1E1E1E' },
        { threads: [{ thread: 'Cosmo 2500', name: 'Charcoal', strands: 2 }], printedStitches: 3, color: undefined },
      ])
    },
  )

  test(
    "a legend with a column of framed swatch boxes is read as the chart's legend",
    { needs: ['import', 'legend'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^', '^^'], legendBoxes: 'framed swatches' })

      await stitcher.seesLegend([
        { threads: [{ thread: 'DMC 310', name: 'Black', strands: 2 }], printedStitches: 1 },
        { threads: [{ thread: 'DMC 321', name: 'Red', strands: 2 }], printedStitches: 3 },
      ])
    },
  )

  test(
    "a legend that prints each symbol in a ruled box is read as the chart's legend",
    { needs: ['import', 'legend'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^', '^^'], legendBoxes: 'boxed symbols' })

      await stitcher.seesLegend([
        { threads: [{ thread: 'DMC 310', name: 'Black', strands: 2 }], printedStitches: 1 },
        { threads: [{ thread: 'DMC 321', name: 'Red', strands: 2 }], printedStitches: 3 },
      ])
    },
  )

  test("the chart's title is read from its info page", { needs: ['import', 'chart title'] }, async ({ stitcher }) => {
    await stitcher.importsChart({ grid: ['#^', '^^'], printedTitle: 'Autumn Fox' })

    await stitcher.seesChartTitled('Autumn Fox')
  })

  test(
    'a legend entry whose printed count differs from its stitches gives an import issue naming them',
    { needs: ['import', 'import issues'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^', '^^'], legend: { '^': { printedCount: 4 } } })

      await stitcher.seesImportIssues([
        {
          kind: 'legend count mismatch',
          thread: 'DMC 321',
          printed: 4,
          parsed: 3,
          stitches: [
            [2, 1],
            [1, 2],
            [2, 2],
          ],
        },
      ])
    },
  )

  test(
    'a symbol the legend leaves out gives an import issue naming its stitches',
    { needs: ['import', 'import issues'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({ grid: ['#^', '.^'], legend: { '^': 'not printed' } })

      await stitcher.seesImportIssues([
        {
          kind: 'symbol not in legend',
          stitches: [
            [2, 1],
            [2, 2],
          ],
        },
      ])
    },
  )

  test(
    'a legend entry with no stitches in the chart gives an import issue',
    { needs: ['import', 'import issues'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({
        grid: ['##', '#.'],
        legend: { '^': { threads: [{ thread: 'DMC 321', strands: 2 }] } },
      })

      await stitcher.seesImportIssues([{ kind: 'legend entry with no stitches', thread: 'DMC 321' }])
    },
  )

  test(
    'a chart whose legend matches its stitches gives no import issues',
    { needs: ['import', 'import issues'] },
    async ({ stitcher }) => {
      await stitcher.importsChart({
        size: { width: 24, height: 20 },
        printedOn: { pagesAcross: 2, pagesDown: 2 },
        overlap: 2,
        printedSize: { width: 24, height: 20 },
        printedTitle: 'Autumn Fox',
        legend: {
          '#': {
            threads: [
              { thread: 'DMC 310', strands: 1 },
              { thread: 'DMC 3371', strands: 1 },
            ],
          },
        },
        legendHeadings: [{ symbol: 'Symbol', brand: 'Number', name: 'Name', strands: 'Strands', count: 'Stitches' }],
      })

      await stitcher.seesNoImportIssues()
    },
  )
}
