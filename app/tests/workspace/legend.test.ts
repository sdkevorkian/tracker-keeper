// @vitest-environment node
import { expect, test } from 'vitest'
import { createWorkspace } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import { buildChartPdf, type LegendEntry, type LegendPage, type PageDescription } from '../support/chartPdf.ts'

async function importChart(
  chart: PageDescription,
  entries: LegendEntry[],
  layout: Omit<LegendPage, 'type' | 'entries'> = {},
) {
  const workspace = createWorkspace({ readCharts: readChartsInProcess })
  const chartId = await workspace.importPdf(
    buildChartPdf({
      fonts: {
        StitchSymbols: { glyphs: { 0x41: 'square', 0x42: 'triangle', 0x43: 'square' } },
        // A bold variant with the same symbols, plus the blank glyphs some legends pad symbols with.
        'StitchSymbols,Bold': {
          glyphs: { 0x00: 'square', 0x20: 'square', 0x41: 'square', 0x42: 'triangle', 0x43: 'square' },
          unicode: { 0x00: '\u0000', 0x20: ' ' },
        },
      },
      symbols: {
        '#': { font: 'StitchSymbols', code: 0x41 },
        '^': { font: 'StitchSymbols', code: 0x42 },
        '@': { font: 'StitchSymbols', code: 0x43 },
      },
      pages: [chart, { type: 'legend', entries, ...layout }],
    }),
  )
  return workspace.state.charts.get(chartId)!
}

const black: LegendEntry = { symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 2 }

test('a legend entry with no stitches is reported as that, not as a count mismatch', async () => {
  const chart = await importChart({ type: 'chart', cell: { width: 10, height: 10 }, grid: ['##'] }, [
    black,
    { symbol: '^', thread: { brand: 'DMC', code: '321' }, name: 'Red', strands: 2, count: 5 },
  ])

  expect(chart.importIssues).toEqual([{ kind: 'legend entry with no stitches', entry: 2 }])
})

test("a DMC thread keeps the bundled color even when the legend's swatch differs", async () => {
  const chart = await importChart({ type: 'chart', cell: { width: 10, height: 10 }, grid: ['##'] }, [
    { ...black, swatch: '#202020' },
  ])

  // From craft-color-codes' dmc-floss.json.
  expect(chart.legend[0].color).toBe('#000000')
})

test("a blend's color is its legend swatch's", async () => {
  const chart = await importChart({ type: 'chart', cell: { width: 10, height: 10 }, grid: ['#'] }, [
    {
      symbol: '#',
      threads: [
        { thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 1 },
        { thread: { brand: 'DMC', code: '3371' }, name: 'Black Brown', strands: 1 },
      ],
      count: 1,
      swatch: '#1B1410',
    },
  ])

  expect(chart.legend[0].color).toBe('#1B1410')
})

test('a symbol missing from the legend on stitches two pages repeat names each of its cells once', async () => {
  // Two pages side by side; the second repeats columns 3 and 4.
  const chart = await importChart(
    {
      type: 'chart',
      cell: { width: 10, height: 10 },
      grid: ['#@#@##', '##@###', '@#####'],
      pageSize: { width: 4, height: 3 },
      overlap: 2,
    },
    [{ ...black, count: 14 }],
  )

  expect(chart.importIssues).toEqual([
    { kind: 'symbol not in legend', symbol: { font: 'StitchSymbols', code: 0x43 }, cells: [1, 3, 8, 12] },
  ])
})

test('a legend that prints skeins and no thread names is read', async () => {
  const chart = await importChart(
    { type: 'chart', cell: { width: 10, height: 10 }, grid: ['##'] },
    [{ ...black, thread: { brand: 'DMC', code: '13' } }],
    { columns: ['symbol', 'brand', 'code', 'strands', 'skeins', 'count'] },
  )

  expect(chart.legend.map(({ threads, printedCount }) => ({ threads, printedCount }))).toEqual([
    { threads: [{ brand: 'DMC', code: '13', strands: 2 }], printedCount: 2 },
  ])
})

test('a legend that prints only threads and names is read, and checks no counts', async () => {
  const chart = await importChart({ type: 'chart', cell: { width: 10, height: 10 }, grid: ['##'] }, [black], {
    columns: ['symbol', 'brand', 'code', 'name'],
  })

  expect(chart.legend.map(({ threads, printedCount }) => ({ threads, printedCount }))).toEqual([
    { threads: [{ brand: 'DMC', code: '310', name: 'Black' }], printedCount: undefined },
  ])
  expect(chart.importIssues).toEqual([])
})

test('a legend that names its brand once and prints bare codes gives each thread that brand', async () => {
  const chart = await importChart({ type: 'chart', cell: { width: 10, height: 10 }, grid: ['##'] }, [black], {
    notes: ['Floss: DMC'],
    columns: ['symbol', 'code', 'strands'],
  })

  expect(chart.legend.map(({ threads, color }) => ({ threads, color }))).toEqual([
    { threads: [{ brand: 'DMC', code: '310', strands: 2 }], color: '#000000' },
  ])
})

test('entries printed side by side on one line are read as separate legend entries, in reading order', async () => {
  const chart = await importChart(
    { type: 'chart', cell: { width: 10, height: 10 }, grid: ['#^@#'] },
    [
      black,
      { symbol: '^', thread: { brand: 'DMC', code: '321' }, name: 'Red', strands: 1, count: 1 },
      { symbol: '@', thread: { brand: 'DMC', code: '3865' }, name: 'Winter White', strands: 2, count: 1 },
    ],
    { notes: ['Floss: DMC'], columns: ['symbol', 'code', 'strands'], entriesPerLine: 2 },
  )

  expect(chart.legend.map(({ threads }) => threads)).toEqual([
    [{ brand: 'DMC', code: '310', strands: 2 }],
    [{ brand: 'DMC', code: '321', strands: 1 }],
    [{ brand: 'DMC', code: '3865', strands: 2 }],
  ])
  expect(Array.from(chart.cells)).toEqual([1, 2, 3, 1])
})

test('a row number printed before the symbol is not part of the entry', async () => {
  const chart = await importChart(
    { type: 'chart', cell: { width: 10, height: 10 }, grid: ['##'] },
    [{ ...black, count: 1700 }],
    { columns: ['row number', 'symbol', 'brand', 'code', 'name', 'count'] },
  )

  expect(chart.legend.map(({ threads, printedCount }) => ({ threads, printedCount }))).toEqual([
    { threads: [{ brand: 'DMC', code: '310', name: 'Black' }], printedCount: 1700 },
  ])
})

test("a thread's code and name printed together, as '745 - BANANA YELLOW', are read apart", async () => {
  const chart = await importChart(
    { type: 'chart', cell: { width: 10, height: 10 }, grid: ['##'] },
    [{ ...black, thread: { brand: 'DMC', code: '745' }, name: 'BANANA YELLOW', count: 748 }],
    { notes: ['PALETTE: DMC'], columns: ['row number', 'symbol', 'code - name', 'count'] },
  )

  expect(chart.legend.map(({ threads, printedCount }) => ({ threads, printedCount }))).toEqual([
    { threads: [{ brand: 'DMC', code: '745', name: 'BANANA YELLOW' }], printedCount: 748 },
  ])
})

test('a lone small number is the stitch count when the heading above it says stitches', async () => {
  const chart = await importChart({ type: 'chart', cell: { width: 10, height: 10 }, grid: ['##'] }, [black], {
    columns: ['symbol', 'brand', 'code', 'name', 'count'],
    headings: [{ symbol: 'SYMBOL', brand: 'COLOR CODE', name: 'NAME', count: 'STITCHES' }],
  })

  expect(chart.legend.map(({ threads, printedCount }) => ({ threads, printedCount }))).toEqual([
    { threads: [{ brand: 'DMC', code: '310', name: 'Black' }], printedCount: 2 },
  ])
})

test("a legend printing its symbols in a bold variant of the chart's font matches the chart's symbols", async () => {
  const chart = await importChart(
    { type: 'chart', cell: { width: 10, height: 10 }, grid: ['#^'] },
    [
      { ...black, count: 1 },
      { symbol: '^', thread: { brand: 'DMC', code: '321' }, name: 'Red', strands: 2, count: 1 },
    ],
    { symbolFont: 'StitchSymbols,Bold' },
  )

  expect(chart.legend.map(({ symbol }) => symbol)).toEqual([
    { font: 'StitchSymbols', code: 0x41 },
    { font: 'StitchSymbols', code: 0x42 },
  ])
  expect(Array.from(chart.cells)).toEqual([1, 2])
  expect(chart.importIssues).toEqual([])
})

test('blank glyphs padding a legend symbol are not symbols themselves', async () => {
  const chart = await importChart(
    { type: 'chart', cell: { width: 10, height: 10 }, grid: ['##'] },
    [{ ...black, count: 1700 }],
    {
      symbolFont: 'StitchSymbols,Bold',
      paddedSymbols: true,
      columns: ['row number', 'symbol', 'brand', 'code', 'count'],
    },
  )

  expect(chart.legend.map(({ symbol, threads, printedCount }) => ({ symbol, threads, printedCount }))).toEqual([
    { symbol: { font: 'StitchSymbols', code: 0x41 }, threads: [{ brand: 'DMC', code: '310' }], printedCount: 1700 },
  ])
})

test('a legend printed twice, on two pages, gives each legend entry once', async () => {
  const legend: PageDescription = { type: 'legend', entries: [black] }
  const workspace = createWorkspace({ readCharts: readChartsInProcess })
  const chartId = await workspace.importPdf(
    buildChartPdf({
      fonts: { StitchSymbols: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSymbols', code: 0x41 } },
      pages: [legend, legend, { type: 'chart', cell: { width: 10, height: 10 }, grid: ['##'] }],
    }),
  )

  const chart = workspace.state.charts.get(chartId)!
  expect(chart.legend.map(({ symbol }) => symbol)).toEqual([{ font: 'StitchSymbols', code: 0x41 }])
  expect(chart.importIssues).toEqual([])
})

test('thread names whose words are spaced without space characters keep their spaces', async () => {
  const chart = await importChart(
    { type: 'chart', cell: { width: 10, height: 10 }, grid: ['##'] },
    [{ ...black, thread: { brand: 'DMC', code: '158' }, name: 'Cornflower Blue medium' }],
    { wordSpacing: 'moved', columns: ['symbol', 'brand', 'code', 'name'] },
  )

  expect(chart.legend.map(({ threads }) => threads)).toEqual([
    [{ brand: 'DMC', code: '158', name: 'Cornflower Blue medium' }],
  ])
})
