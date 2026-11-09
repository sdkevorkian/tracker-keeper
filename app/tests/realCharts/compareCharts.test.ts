// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { buildChartPdf } from '../support/chartPdf.ts'
import { compareChartFolder } from './compareCharts.ts'

/** A one-page chart: 3 × 2, two legend entries, no import issues. */
function smallChartPdf() {
  return buildChartPdf({
    fonts: { StitchSymbols: { glyphs: { 0x41: 'square', 0x42: 'triangle' } } },
    symbols: {
      '#': { font: 'StitchSymbols', code: 0x41 },
      '^': { font: 'StitchSymbols', code: 0x42 },
    },
    pages: [
      { type: 'chart', cell: { width: 10, height: 10 }, grid: ['#^.', '^##'] },
      {
        type: 'legend',
        entries: [
          { symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 3 },
          { symbol: '^', thread: { brand: 'DMC', code: '321' }, name: 'Red', strands: 2, count: 2 },
        ],
      },
    ],
  })
}

/** What the small chart should import as, written out by hand. */
const smallChartExpected = {
  charts: [
    {
      size: { width: 3, height: 2 },
      legend: [
        {
          symbol: { font: 'StitchSymbols', code: 0x41 },
          threads: [{ brand: 'DMC', code: '310', name: 'Black', strands: 2 }],
          stitches: 3,
        },
        {
          symbol: { font: 'StitchSymbols', code: 0x42 },
          threads: [{ brand: 'DMC', code: '321', name: 'Red', strands: 2 }],
          stitches: 2,
        },
      ],
      importIssues: [],
    },
  ],
}

function folderWith(files: Record<string, Uint8Array | object>) {
  const folder = mkdtempSync(join(tmpdir(), 'real-charts-'))
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(folder, name), content instanceof Uint8Array ? content : JSON.stringify(content, null, 2))
  }
  return folder
}

test('a chart that imports as its expected output matches', async () => {
  const folder = folderWith({ 'small.pdf': smallChartPdf(), 'small.expected.json': smallChartExpected })

  const results = await compareChartFolder(folder)

  expect(results).toEqual([{ pdf: 'small.pdf', outcome: 'matches' }])
})

test('import issues are compared by how many cells they name, not which', async () => {
  const pdf = buildChartPdf({
    fonts: { StitchSymbols: { glyphs: { 0x41: 'square', 0x43: 'triangle' } } },
    symbols: { '#': { font: 'StitchSymbols', code: 0x41 }, '@': { font: 'StitchSymbols', code: 0x43 } },
    pages: [
      { type: 'chart', cell: { width: 10, height: 10 }, grid: ['#@#', '@##'] },
      {
        type: 'legend',
        entries: [{ symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 4 }],
      },
    ],
  })
  const expected = {
    charts: [
      {
        size: { width: 3, height: 2 },
        legend: [
          {
            symbol: { font: 'StitchSymbols', code: 0x41 },
            threads: [{ brand: 'DMC', code: '310', name: 'Black', strands: 2 }],
            stitches: 4,
          },
        ],
        importIssues: [{ kind: 'symbol not in legend', symbol: { font: 'StitchSymbols', code: 0x43 }, cells: 2 }],
      },
    ],
  }
  const folder = folderWith({ 'unlisted.pdf': pdf, 'unlisted.expected.json': expected })

  const results = await compareChartFolder(folder)

  expect(results).toEqual([{ pdf: 'unlisted.pdf', outcome: 'matches' }])
})

test('a chart that imports differently from its expected output reports the chart and what differs', async () => {
  const expected = structuredClone(smallChartExpected)
  expected.charts[0].size.height = 3
  expected.charts[0].legend[1].stitches = 4
  const folder = folderWith({
    'matching.pdf': smallChartPdf(),
    'matching.expected.json': smallChartExpected,
    'small.pdf': smallChartPdf(),
    'small.expected.json': expected,
  })

  const results = await compareChartFolder(folder)

  expect(results).toEqual([
    { pdf: 'matching.pdf', outcome: 'matches' },
    {
      pdf: 'small.pdf',
      outcome: 'differs',
      differences: ['chart 1 size.height: expected 3, got 2', 'chart 1 legend entry 2 stitches: expected 4, got 2'],
    },
  ])
})

test('a chart with no expected output is skipped, not failed', async () => {
  const folder = folderWith({
    'new.pdf': smallChartPdf(),
    'small.pdf': smallChartPdf(),
    'small.expected.json': smallChartExpected,
  })

  const results = await compareChartFolder(folder)

  expect(results).toEqual([
    { pdf: 'new.pdf', outcome: 'no expected output' },
    { pdf: 'small.pdf', outcome: 'matches' },
  ])
})

test('update mode writes what each chart imports as its expected output, in the given folder only', async () => {
  const stale = structuredClone(smallChartExpected)
  stale.charts[0].legend[0].stitches = 99
  const folder = folderWith({ 'new.pdf': smallChartPdf(), 'stale.pdf': smallChartPdf(), 'stale.expected.json': stale })

  const results = await compareChartFolder(folder, { update: true })

  expect(results).toEqual([
    { pdf: 'new.pdf', outcome: 'updated' },
    { pdf: 'stale.pdf', outcome: 'updated' },
  ])
  expect(readdirSync(folder).sort()).toEqual(['new.expected.json', 'new.pdf', 'stale.expected.json', 'stale.pdf'])
  expect(JSON.parse(readFileSync(join(folder, 'new.expected.json'), 'utf8'))).toEqual(smallChartExpected)
  expect(JSON.parse(readFileSync(join(folder, 'stale.expected.json'), 'utf8'))).toEqual(smallChartExpected)
})
