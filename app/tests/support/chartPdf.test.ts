// @vitest-environment node
import { expect, test } from 'vitest'
import { buildChartPdf } from './chartPdf.ts'
import { readPdf } from './readPdf.ts'

test('a chart page prints each symbol in its cell, in its font, at its character code', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square', 0x42: 'triangle' } } },
      symbols: {
        '#': { font: 'StitchSquares', code: 0x41 },
        '^': { font: 'StitchSquares', code: 0x42 },
      },
      pages: [{ type: 'chart', cell: { width: 10, height: 10 }, grid: ['#^', '^#'] }],
    }),
  )

  const [first, ...rest] = pdf.pages[0].glyphs
  expect([first, ...rest].map(({ font, code, x, y }) => ({ font, code, x: x - first.x, y: first.y - y }))).toEqual([
    { font: 'StitchSquares', code: 0x41, x: 0, y: 0 },
    { font: 'StitchSquares', code: 0x42, x: 10, y: 0 },
    { font: 'StitchSquares', code: 0x42, x: 0, y: 10 },
    { font: 'StitchSquares', code: 0x41, x: 10, y: 10 },
  ])
})

test('cells need not be square, and a dot leaves a cell blank', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSquares', code: 0x41 } },
      pages: [{ type: 'chart', cell: { width: 8, height: 12 }, grid: ['#.#', '.#.'] }],
    }),
  )

  const [first, ...rest] = pdf.pages[0].glyphs
  expect([first, ...rest].map(({ x, y }) => ({ x: x - first.x, y: first.y - y }))).toEqual([
    { x: 0, y: 0 },
    { x: 16, y: 0 },
    { x: 8, y: 12 },
  ])
})

test('a chart page draws a solid grid line along every row and column edge', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSquares', code: 0x41 } },
      pages: [{ type: 'chart', cell: { width: 8, height: 12 }, grid: ['#.#', '.#.'] }],
    }),
  )

  const lines = pdf.pages[0].lines
  const left = Math.min(...lines.flatMap((line) => [line.x1, line.x2]))
  const top = Math.max(...lines.flatMap((line) => [line.y1, line.y2]))
  const relative = lines.map(({ x1, y1, x2, y2 }) => ({ x1: x1 - left, y1: top - y1, x2: x2 - left, y2: top - y2 }))
  expect(relative).toEqual(
    expect.arrayContaining([
      ...[0, 12, 24].map((y) => ({ x1: 0, y1: y, x2: 24, y2: y })),
      ...[0, 8, 16, 24].map((x) => ({ x1: x, y1: 0, x2: x, y2: 24 })),
    ]),
  )
  expect(relative).toHaveLength(7)
})

test('a grid character with no symbol is a mistake in the test, not a blank cell', () => {
  expect(() =>
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSquares', code: 0x41 } },
      pages: [{ type: 'chart', cell: { width: 10, height: 10 }, grid: ['#?'] }],
    }),
  ).toThrow(/"\?"/)
})

test('a symbol in a font that is not embedded is a mistake in the test', () => {
  expect(() =>
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSqaures', code: 0x41 } },
      pages: [{ type: 'chart', cell: { width: 10, height: 10 }, grid: ['#'] }],
    }),
  ).toThrow(/"#".*"StitchSqaures"/)
})

test('a legend page prints each legend entry as its symbol followed by thread, name, strands and count', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square', 0x42: 'triangle' } } },
      symbols: {
        '#': { font: 'StitchSquares', code: 0x41 },
        '^': { font: 'StitchSquares', code: 0x42 },
      },
      pages: [
        {
          type: 'legend',
          entries: [
            { symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 125 },
            { symbol: '^', thread: { brand: 'Anchor', code: '403' }, name: 'Black', strands: 1, count: 7 },
          ],
        },
      ],
    }),
  )

  const page = pdf.pages[0]
  const rows = page.glyphs
    .filter((glyph) => glyph.font === 'StitchSquares')
    .map((symbol) => [
      symbol.code,
      ...page.text
        .filter((text) => text.y === symbol.y && text.x > symbol.x)
        .sort((a, b) => a.x - b.x)
        .map((text) => text.str),
    ])
  expect(rows).toEqual([
    [0x41, 'DMC', '310', 'Black', '2', '125'],
    [0x42, 'Anchor', '403', 'Black', '1', '7'],
  ])
})

test('a PDF can hold pages that are neither chart nor legend, in the order given', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSquares', code: 0x41 } },
      pages: [
        { type: 'text', lines: ['Test Sampler', 'A synthetic chart'] },
        { type: 'chart', cell: { width: 10, height: 10 }, grid: ['#'] },
        {
          type: 'legend',
          entries: [{ symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 1 }],
        },
        { type: 'text', lines: ['Use 2 strands (full cross stitch) \\ 1 strand backstitch'] },
      ],
    }),
  )

  expect(pdf.pages.map((page) => page.glyphs.filter((glyph) => glyph.font === 'StitchSquares').length)).toEqual([
    0, 1, 1, 0,
  ])
  expect(pdf.pages[0].text.map((text) => text.str)).toEqual(['Test Sampler', 'A synthetic chart'])
  expect(pdf.pages[3].text.map((text) => text.str)).toEqual([
    'Use 2 strands (full cross stitch) \\ 1 strand backstitch',
  ])
})

test('two embedded fonts can share a character code, and a font can leave out its ToUnicode map', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: {
        Mapped: { glyphs: { 0x41: 'square' } },
        Unmapped: { glyphs: { 0x41: 'triangle' }, toUnicode: false },
      },
      symbols: {
        '#': { font: 'Mapped', code: 0x41 },
        '^': { font: 'Unmapped', code: 0x41 },
      },
      pages: [{ type: 'chart', cell: { width: 10, height: 10 }, grid: ['#^'] }],
    }),
  )

  expect(pdf.pages[0].glyphs.map(({ font, code, unicode, embedded }) => ({ font, code, unicode, embedded }))).toEqual([
    { font: 'Mapped', code: 0x41, unicode: '■', embedded: true },
    { font: 'Unmapped', code: 0x41, unicode: 'A', embedded: true },
  ])
})
