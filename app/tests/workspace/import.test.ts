// @vitest-environment node
import { expect, test } from 'vitest'
import { createWorkspace } from '../../src/workspace/workspace.ts'
import { buildChartPdf, type PageDescription } from '../support/chartPdf.ts'

test('importing a one-page chart gives its size, cells and legend entries', async () => {
  const workspace = createWorkspace()

  const chartId = await workspace.importPdf(
    buildChartPdf({
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
    }),
  )

  const chart = workspace.state.charts.get(chartId)!
  expect({ width: chart.width, height: chart.height }).toEqual({ width: 3, height: 2 })
  expect(chart.legend.map(({ symbol, threads, printedCount }) => ({ symbol, threads, printedCount }))).toEqual([
    {
      symbol: { font: 'StitchSymbols', code: 0x41 },
      threads: [{ brand: 'DMC', code: '310', name: 'Black', strands: 2 }],
      printedCount: 3,
    },
    {
      symbol: { font: 'StitchSymbols', code: 0x42 },
      threads: [{ brand: 'DMC', code: '321', name: 'Red', strands: 2 }],
      printedCount: 2,
    },
  ])
  // 0 is a blank cell; n is the nth legend entry.
  expect(Array.from(chart.cells)).toEqual([1, 2, 0, 2, 1, 1])
})

test('two fonts that share a character code give two different symbols and legend entries', async () => {
  const workspace = createWorkspace()

  const chartId = await workspace.importPdf(
    buildChartPdf({
      fonts: {
        Squares: { glyphs: { 0x41: 'square' } },
        Triangles: { glyphs: { 0x41: 'triangle' } },
      },
      symbols: {
        '#': { font: 'Squares', code: 0x41 },
        '^': { font: 'Triangles', code: 0x41 },
      },
      pages: [
        { type: 'chart', cell: { width: 10, height: 10 }, grid: ['#^', '^^'] },
        {
          type: 'legend',
          entries: [
            { symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 1 },
            { symbol: '^', thread: { brand: 'DMC', code: '321' }, name: 'Red', strands: 2, count: 3 },
          ],
        },
      ],
    }),
  )

  const chart = workspace.state.charts.get(chartId)!
  expect(chart.legend.map(({ symbol, threads }) => ({ symbol, code: threads[0].code }))).toEqual([
    { symbol: { font: 'Squares', code: 0x41 }, code: '310' },
    { symbol: { font: 'Triangles', code: 0x41 }, code: '321' },
  ])
  expect(Array.from(chart.cells)).toEqual([1, 2, 2, 2])
})

test('a chart whose symbol font has no ToUnicode map imports the same as one that has it', async () => {
  const importWith = async (toUnicode: boolean) => {
    const workspace = createWorkspace()
    const chartId = await workspace.importPdf(
      buildChartPdf({
        fonts: { StitchSymbols: { glyphs: { 0x41: 'square', 0x42: 'triangle' }, toUnicode } },
        symbols: {
          '#': { font: 'StitchSymbols', code: 0x41 },
          '^': { font: 'StitchSymbols', code: 0x42 },
        },
        pages: [
          { type: 'chart', cell: { width: 10, height: 10 }, grid: ['#^', '^#'] },
          {
            type: 'legend',
            entries: [
              { symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 2 },
              { symbol: '^', thread: { brand: 'DMC', code: '321' }, name: 'Red', strands: 2, count: 2 },
            ],
          },
        ],
      }),
    )
    const { width, height, cells, legend } = workspace.state.charts.get(chartId)!
    return { width, height, cells: Array.from(cells), legend }
  }

  const unmapped = await importWith(false)
  expect(unmapped.cells).toEqual([1, 2, 2, 1])
  expect(unmapped.legend.map(({ symbol }) => symbol)).toEqual([
    { font: 'StitchSymbols', code: 0x41 },
    { font: 'StitchSymbols', code: 0x42 },
  ])
  expect(unmapped).toEqual(await importWith(true))
})

test('a cover page and an instructions page are ignored', async () => {
  const importPages = async (pages: PageDescription[]) => {
    const workspace = createWorkspace()
    const chartId = await workspace.importPdf(
      buildChartPdf({
        fonts: { StitchSymbols: { glyphs: { 0x41: 'square', 0x42: 'triangle' } } },
        symbols: {
          '#': { font: 'StitchSymbols', code: 0x41 },
          '^': { font: 'StitchSymbols', code: 0x42 },
        },
        pages,
      }),
    )
    const { width, height, cells, legend } = workspace.state.charts.get(chartId)!
    return { charts: workspace.state.charts.size, width, height, cells: Array.from(cells), legend }
  }
  const chart: PageDescription = { type: 'chart', cell: { width: 10, height: 10 }, grid: ['#^', '^#'] }
  const legend: PageDescription = {
    type: 'legend',
    entries: [
      { symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 2 },
      { symbol: '^', thread: { brand: 'DMC', code: '321' }, name: 'Red', strands: 2, count: 2 },
    ],
  }

  const withExtraPages = await importPages([
    { type: 'text', lines: ['Test Sampler', 'A synthetic chart', '14 count Aida, 2 x 2 stitches'] },
    chart,
    legend,
    { type: 'text', lines: ['Use 2 strands for full cross stitch.', 'DMC 310 Black 2 2', 'Start in the middle.'] },
  ])

  expect(withExtraPages).toEqual(await importPages([chart, legend]))
  expect(withExtraPages.charts).toBe(1)
})

test('an info page with a ruled table is not a chart', async () => {
  const workspace = createWorkspace()

  await workspace.importPdf(
    buildChartPdf({
      fonts: { StitchSymbols: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSymbols', code: 0x41 } },
      pages: [
        { type: 'chart', cell: { width: 10, height: 10 }, grid: ['##', '#.'] },
        {
          type: 'legend',
          entries: [{ symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 3 }],
        },
        {
          type: 'table',
          cell: { width: 100, height: 16 },
          rows: [
            ['Title', 'Test Sampler'],
            ['Grid Size', '2W x 2H'],
            ['Fabric', '14 count Aida'],
            ['Stitches', '3'],
          ],
        },
      ],
    }),
  )

  expect([...workspace.state.charts.values()].map(({ width, height }) => ({ width, height }))).toEqual([
    { width: 2, height: 2 },
  ])
})

test('subscribers hear about an imported chart until they unsubscribe', async () => {
  const workspace = createWorkspace()
  const pdf = buildChartPdf({
    fonts: { StitchSymbols: { glyphs: { 0x41: 'square' } } },
    symbols: { '#': { font: 'StitchSymbols', code: 0x41 } },
    pages: [
      { type: 'chart', cell: { width: 10, height: 10 }, grid: ['#'] },
      {
        type: 'legend',
        entries: [{ symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 1 }],
      },
    ],
  })
  const heard: number[] = []
  const unsubscribe = workspace.subscribe((state) => heard.push(state.charts.size))

  await workspace.importPdf(pdf)
  unsubscribe()
  await workspace.importPdf(pdf)

  expect(heard).toEqual([1])
  expect(workspace.state.charts.size).toBe(2)
})

test('DMC threads get their color from the bundled table, and other brands get none', async () => {
  const workspace = createWorkspace()

  const chartId = await workspace.importPdf(
    buildChartPdf({
      fonts: { StitchSymbols: { glyphs: { 0x41: 'square', 0x42: 'triangle', 0x43: 'square' } } },
      symbols: {
        '#': { font: 'StitchSymbols', code: 0x41 },
        '^': { font: 'StitchSymbols', code: 0x42 },
        '@': { font: 'StitchSymbols', code: 0x43 },
      },
      pages: [
        { type: 'chart', cell: { width: 10, height: 10 }, grid: ['#^@'] },
        {
          type: 'legend',
          entries: [
            { symbol: '#', thread: { brand: 'DMC', code: '321' }, name: 'Red', strands: 2, count: 1 },
            { symbol: '^', thread: { brand: 'DMC', code: 'Blanc' }, name: 'White', strands: 2, count: 1 },
            { symbol: '@', thread: { brand: 'Anchor', code: '403' }, name: 'Black', strands: 2, count: 1 },
          ],
        },
      ],
    }),
  )

  // Expected colors are from craft-color-codes' dmc-floss.json.
  expect(workspace.state.charts.get(chartId)!.legend.map((entry) => entry.color)).toEqual([
    '#C72B3B',
    '#FCFBF8',
    undefined,
  ])
})
