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

test('a chart page can print a character in each blank cell, such as a space from its symbol font', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x20: 'blank', 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSquares', code: 0x41 } },
      pages: [
        {
          type: 'chart',
          cell: { width: 10, height: 10 },
          grid: ['#.', '.#'],
          blankCells: { font: 'StitchSquares', code: 0x20 },
        },
      ],
    }),
  )

  const [first, ...rest] = pdf.pages[0].glyphs
  expect(
    [first, ...rest].map(({ code, unicode, x, y }) => ({ code, unicode, x: x - first.x, y: first.y - y })),
  ).toEqual([
    { code: 0x41, unicode: '■', x: 0, y: 0 },
    { code: 0x20, unicode: ' ', x: 10, y: 0 },
    { code: 0x20, unicode: ' ', x: 0, y: 10 },
    { code: 0x41, unicode: '■', x: 10, y: 10 },
  ])
})

/** A page's chart symbols read back as grid rows, one letter per character code from 0x41. */
function gridOn(page: { glyphs: { font: string; code: number; x: number; y: number }[] }, cell: number) {
  const symbols = page.glyphs.filter((glyph) => glyph.font === 'StitchSquares')
  const left = Math.min(...symbols.map(({ x }) => x))
  const top = Math.max(...symbols.map(({ y }) => y))
  const rows: string[][] = []
  for (const { code, x, y } of symbols) {
    const row = Math.round((top - y) / cell)
    const column = Math.round((x - left) / cell)
    rows[row] ??= []
    rows[row][column] = String.fromCharCode(code).toLowerCase()
  }
  return rows.map((row) => row.join(''))
}

test('a chart larger than a page is split into pages of that many stitches, row by row', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: {
        StitchSquares: {
          glyphs: {
            0x41: 'square',
            0x42: 'triangle',
            0x43: 'square',
            0x44: 'triangle',
          },
        },
      },
      symbols: {
        a: { font: 'StitchSquares', code: 0x41 },
        b: { font: 'StitchSquares', code: 0x42 },
        c: { font: 'StitchSquares', code: 0x43 },
        d: { font: 'StitchSquares', code: 0x44 },
      },
      pages: [
        {
          type: 'chart',
          cell: { width: 10, height: 10 },
          grid: ['aabbc', 'aabbc', 'ccdda'],
          pageSize: { width: 2, height: 2 },
        },
      ],
    }),
  )

  expect(pdf.pages.map((page) => gridOn(page, 10))).toEqual([
    ['aa', 'aa'],
    ['bb', 'bb'],
    ['c', 'c'],
    ['cc'],
    ['dd'],
    ['a'],
  ])
})

test('neighbouring pages can repeat rows and columns, and no page holds only repeats', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: {
        StitchSquares: {
          glyphs: {
            0x41: 'square',
            0x42: 'triangle',
            0x43: 'square',
            0x44: 'triangle',
          },
        },
      },
      symbols: {
        a: { font: 'StitchSquares', code: 0x41 },
        b: { font: 'StitchSquares', code: 0x42 },
        c: { font: 'StitchSquares', code: 0x43 },
        d: { font: 'StitchSquares', code: 0x44 },
      },
      pages: [
        {
          type: 'chart',
          cell: { width: 10, height: 10 },
          grid: ['abcda', 'bcdab', 'cdabc'],
          pageSize: { width: 3, height: 2 },
          overlap: 1,
        },
      ],
    }),
  )

  expect(pdf.pages.map((page) => gridOn(page, 10))).toEqual([
    ['abc', 'bcd'],
    ['cda', 'dab'],
    ['bcd', 'cda'],
    ['dab', 'abc'],
  ])
})

test('overlap marks shade the stitches a page repeats and point arrows at where neighbouring pages align', async () => {
  const cell = 10
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { a: { font: 'StitchSquares', code: 0x41 } },
      pages: [
        {
          type: 'chart',
          cell: { width: cell, height: cell },
          grid: Array.from({ length: 6 }, () => 'a'.repeat(6)),
          pageSize: { width: 4, height: 4 },
          overlap: 2,
          overlapMarks: true,
        },
      ],
    }),
  )

  // In cells from the page's top left grid corner. Pages start at stitch 1 and 3 each way.
  const marksOn = (page: (typeof pdf.pages)[number]) => {
    const long = page.lines.filter(({ x1, y1, x2, y2 }) => Math.hypot(x2 - x1, y2 - y1) > cell)
    const left = Math.min(...long.map((line) => Math.min(line.x1, line.x2)))
    const top = Math.max(...long.map((line) => Math.max(line.y1, line.y2)))
    const columns = (Math.max(...long.map((line) => Math.max(line.x1, line.x2))) - left) / cell
    const rows = (top - Math.min(...long.map((line) => Math.min(line.y1, line.y2)))) / cell
    const short = page.lines.filter((line) => !long.includes(line))
    const middles = (lines: typeof short, along: 'x' | 'y') =>
      [
        ...new Set(
          lines.map((line) =>
            along === 'x' ? ((line.x1 + line.x2) / 2 - left) / cell : (top - (line.y1 + line.y2) / 2) / cell,
          ),
        ),
      ].sort((a, b) => a - b)
    return {
      // Shading lies inside the grid; the arrows' fills lie outside it.
      shaded: page.fills
        .map(({ x0, y0, x1, y1 }) => ({
          across: [(x0 - left) / cell, (x1 - left) / cell],
          down: [(top - y1) / cell, (top - y0) / cell],
        }))
        .filter(({ across, down }) => across[0] >= 0 && down[0] >= 0 && across[1] <= columns && down[1] <= rows),
      // An arrow's edge across its base runs along the grid edge it points at.
      arrowsAtColumnLines: middles(
        short.filter((line) => line.y1 === line.y2),
        'x',
      ),
      arrowsAtRowLines: middles(
        short.filter((line) => line.x1 === line.x2),
        'y',
      ),
    }
  }
  expect(pdf.pages.map(marksOn)).toEqual([
    { shaded: [], arrowsAtColumnLines: [2], arrowsAtRowLines: [2] },
    { shaded: [{ across: [0, 2], down: [0, 4] }], arrowsAtColumnLines: [0], arrowsAtRowLines: [2] },
    { shaded: [{ across: [0, 4], down: [0, 2] }], arrowsAtColumnLines: [2], arrowsAtRowLines: [0] },
    {
      shaded: [
        { across: [0, 2], down: [0, 4] },
        { across: [0, 4], down: [0, 2] },
      ],
      arrowsAtColumnLines: [0],
      arrowsAtRowLines: [0],
    },
  ])
})

test('margin numbers mark every 10th row and column of the whole chart, outside the grid', async () => {
  const cell = 10
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { a: { font: 'StitchSquares', code: 0x41 } },
      pages: [
        {
          type: 'chart',
          cell: { width: cell, height: cell },
          grid: Array.from({ length: 24 }, () => 'a'.repeat(24)),
          pageSize: { width: 12, height: 12 },
          marginNumbers: true,
        },
      ],
    }),
  )

  // Helvetica digits are 556/1000 of the font size wide, and margin numbers are set at 10 points.
  const middleOf = (text: { str: string; x: number }) => text.x + (text.str.length * 556 * 10) / 1000 / 2
  const numbersOn = (page: (typeof pdf.pages)[number]) => {
    const left = Math.min(...page.lines.map((line) => Math.min(line.x1, line.x2)))
    const top = Math.max(...page.lines.map((line) => Math.max(line.y1, line.y2)))
    return {
      // Columns are numbered from 1 at the page's left edge; rows from 1 at its top edge.
      across: page.text
        .filter((text) => text.y > top)
        .map((text) => ({
          number: text.str,
          column: Math.floor((middleOf(text) - left) / cell) + 1,
        })),
      down: page.text
        .filter((text) => middleOf(text) < left)
        .map((text) => ({
          number: text.str,
          row: Math.floor((top - text.y) / cell) + 1,
        })),
    }
  }

  expect(pdf.pages.map(numbersOn)).toEqual([
    {
      across: [{ number: '10', column: 10 }],
      down: [{ number: '10', row: 10 }],
    },
    {
      across: [{ number: '20', column: 8 }],
      down: [{ number: '10', row: 10 }],
    },
    {
      across: [{ number: '10', column: 10 }],
      down: [{ number: '20', row: 8 }],
    },
    { across: [{ number: '20', column: 8 }], down: [{ number: '20', row: 8 }] },
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

test('a chart page can draw its grid dotted inside a solid border', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSquares', code: 0x41 } },
      pages: [{ type: 'chart', cell: { width: 10, height: 10 }, grid: ['#.', '.#'], gridLines: 'dotted' }],
    }),
  )

  const lines = pdf.pages[0].lines
  const left = Math.min(...lines.flatMap((line) => [line.x1, line.x2]))
  const top = Math.max(...lines.flatMap((line) => [line.y1, line.y2]))
  const relative = lines.map(({ x1, y1, x2, y2 }) => ({ x1: x1 - left, y1: top - y1, x2: x2 - left, y2: top - y2 }))
  const long = relative.filter(({ x1, y1, x2, y2 }) => Math.hypot(x2 - x1, y2 - y1) > 1)
  expect(long).toEqual(
    expect.arrayContaining([
      ...[0, 20].map((y) => ({ x1: 0, y1: y, x2: 20, y2: y })),
      ...[0, 20].map((x) => ({ x1: x, y1: 0, x2: x, y2: 20 })),
    ]),
  )
  expect(long).toHaveLength(4)
  const dots = relative.filter((line) => !long.includes(line))
  const across = dots.filter(({ y1, y2 }) => y1 === 10 && y2 === 10)
  const down = dots.filter(({ x1, x2 }) => x1 === 10 && x2 === 10)
  expect(across.length + down.length).toBe(dots.length)
  // A dot every point along each inner line, each shorter than half a point.
  expect([across.length, down.length]).toEqual([20, 20])
  expect(dots.every(({ x1, y1, x2, y2 }) => Math.hypot(x2 - x1, y2 - y1) < 0.5)).toBe(true)
})

test('a chart page can draw its grid lines as thin filled rectangles instead of strokes', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSquares', code: 0x41 } },
      pages: [{ type: 'chart', cell: { width: 8, height: 12 }, grid: ['#.#', '.#.'], gridLines: 'rectangles' }],
    }),
  )

  const page = pdf.pages[0]
  expect(page.lines).toEqual([])
  const left = Math.min(...page.fills.map(({ x0, x1 }) => (x0 + x1) / 2))
  const top = Math.max(...page.fills.map(({ y0, y1 }) => (y0 + y1) / 2))
  // Each rectangle as the line along its middle, and how thick it is.
  const relative = page.fills.map(({ x0, y0, x1, y1 }) =>
    x1 - x0 > y1 - y0
      ? { x1: x0 - left, y1: top - (y0 + y1) / 2, x2: x1 - left, y2: top - (y0 + y1) / 2, thickness: y1 - y0 }
      : { x1: (x0 + x1) / 2 - left, y1: top - y1, x2: (x0 + x1) / 2 - left, y2: top - y0, thickness: x1 - x0 },
  )
  expect(relative).toEqual(
    expect.arrayContaining([
      ...[0, 12, 24].map((y) => ({ x1: 0, y1: y, x2: 24, y2: y, thickness: 0.5 })),
      ...[0, 8, 16, 24].map((x) => ({ x1: x, y1: 0, x2: x, y2: 24, thickness: 0.5 })),
    ]),
  )
  expect(relative).toHaveLength(7)
})

test('a chart page can draw every 10th row and column line of the whole chart thicker', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSquares', code: 0x41 } },
      pages: [
        {
          type: 'chart',
          cell: { width: 5, height: 5 },
          grid: Array.from({ length: 12 }, () => '#'.repeat(16)),
          pageSize: { width: 8, height: 12 },
          thickLines: 'wide',
        },
      ],
    }),
  )

  // The second page starts at column 9, so its thick column line is its 2nd, at the chart's 10th column edge.
  const thick = pdf.pages.map((page) => {
    const left = Math.min(...page.lines.map((line) => Math.min(line.x1, line.x2)))
    const top = Math.max(...page.lines.map((line) => Math.max(line.y1, line.y2)))
    return page.lines
      .filter(({ width }) => width > 0.5)
      .map(({ x1, y1, x2 }) => (x1 === x2 ? { column: (x1 - left) / 5 } : { row: (top - y1) / 5 }))
  })
  expect(thick).toEqual([
    [{ row: 0 }, { row: 10 }, { column: 0 }],
    [{ row: 0 }, { row: 10 }, { column: 2 }],
  ])
  expect(pdf.pages[0].lines.filter(({ width }) => width === 0.5)).toHaveLength(13 + 9 - 3)
})

test('a chart page can thicken every 10th line by drawing it twice, half a point apart', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSquares', code: 0x41 } },
      pages: [
        {
          type: 'chart',
          cell: { width: 5, height: 5 },
          grid: Array.from({ length: 12 }, () => '#'.repeat(12)),
          thickLines: 'doubled',
        },
      ],
    }),
  )

  const lines = pdf.pages[0].lines
  const left = Math.min(...lines.map((line) => Math.min(line.x1, line.x2)))
  const top = Math.max(...lines.map((line) => Math.max(line.y1, line.y2)))
  const columns = lines.filter(({ x1, x2 }) => x1 === x2).map(({ x1 }) => x1 - left)
  const rows = lines.filter(({ y1, y2 }) => y1 === y2).map(({ y1 }) => top - y1)
  const edges = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]
  expect(columns).toEqual([0, 0.5, ...edges.slice(1, 10), 50, 50.5, ...edges.slice(11)])
  expect(rows).toEqual([0, 0.5, ...edges.slice(1, 10), 50, 50.5, ...edges.slice(11)])
  expect(lines.every(({ width }) => width === 0.5)).toBe(true)
})

test("a chart page can print a logo below its grid: a frame as wide as the grid, a mark and the designer's name", async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSquares', code: 0x41 } },
      pages: [{ type: 'chart', cell: { width: 10, height: 10 }, grid: ['#.#', '.#.'], logo: true }],
    }),
  )

  const page = pdf.pages[0]
  const left = Math.min(...page.lines.map((line) => Math.min(line.x1, line.x2)))
  const top = Math.max(...page.lines.map((line) => Math.max(line.y1, line.y2)))
  const relative = page.lines.map(({ x1, y1, x2, y2 }) => ({
    x1: x1 - left,
    y1: top - y1,
    x2: x2 - left,
    y2: top - y2,
  }))
  // The grid is 30 by 20; the frame sits 15 below it and is 25 tall.
  const frame = relative.filter(({ y1, y2 }) => Math.max(y1, y2) > 20)
  expect(frame).toEqual(
    expect.arrayContaining([
      { x1: 0, y1: 35, x2: 30, y2: 35 },
      { x1: 30, y1: 35, x2: 30, y2: 60 },
      { x1: 30, y1: 60, x2: 0, y2: 60 },
      { x1: 0, y1: 60, x2: 0, y2: 35 },
    ]),
  )
  expect(frame).toHaveLength(4)
  const name = page.text.find(({ str }) => str === 'Test Studio')!
  expect(top - name.y).toBeGreaterThan(35)
  expect(top - name.y).toBeLessThan(60)
  expect(page.fills.filter(({ y1 }) => top - y1 > 35)).toHaveLength(1)
})

test('a table page draws a ruled grid with text in its cells, like a chart info page', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: {},
      symbols: {},
      pages: [
        {
          type: 'table',
          cell: { width: 100, height: 16 },
          rows: [
            ['Title', 'Test Sampler'],
            ['Grid Size', '90W x 90H'],
          ],
        },
      ],
    }),
  )

  const page = pdf.pages[0]
  expect(page.lines).toHaveLength(3 + 3)
  const left = Math.min(...page.lines.map((line) => line.x1))
  const top = Math.max(...page.lines.map((line) => line.y1))
  const cellOf = (text: { x: number; y: number }) => [
    Math.floor((top - text.y) / 16),
    Math.floor((text.x - left) / 100),
  ]
  expect(page.text.map((text) => ({ str: text.str, cell: cellOf(text) }))).toEqual([
    { str: 'Title', cell: [0, 0] },
    { str: 'Test Sampler', cell: [0, 1] },
    { str: 'Grid Size', cell: [1, 0] },
    { str: '90W x 90H', cell: [1, 1] },
  ])
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

/** Each line of a page's text, top to bottom, as its strings left to right. */
function textLines(page: { text: { str: string; x: number; y: number }[] }) {
  return [...new Set(page.text.map(({ y }) => y))]
    .sort((a, b) => b - a)
    .map((y) =>
      page.text
        .filter((text) => text.y === y)
        .sort((a, b) => a.x - b.x)
        .map((text) => text.str),
    )
}

test('a legend prints only the columns it is given, in that order, such as skeins and no name', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSquares', code: 0x41 } },
      pages: [
        {
          type: 'legend',
          columns: ['symbol', 'brand', 'code', 'strands', 'skeins', 'count'],
          entries: [{ symbol: '#', thread: { brand: 'DMC', code: '13' }, name: 'Spearmint', strands: 2, count: 1013 }],
        },
      ],
    }),
  )

  expect(textLines(pdf.pages[0])).toEqual([['■', 'DMC', '13', '2', '0.5 Skeins', '1013']])
})

test('a legend can print lines of notes above its entries', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSquares', code: 0x41 } },
      pages: [
        {
          type: 'legend',
          notes: ['Size: 2 x 1 stitches', 'Floss: DMC'],
          columns: ['symbol', 'code', 'strands'],
          entries: [{ symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 2 }],
        },
      ],
    }),
  )

  expect(textLines(pdf.pages[0])).toEqual([['Size: 2 x 1 stitches'], ['Floss: DMC'], ['■', '310', '2']])
})

test("a legend can number its rows and print each thread's code and name together", async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSquares', code: 0x41 } },
      pages: [
        {
          type: 'legend',
          columns: ['row number', 'symbol', 'code - name', 'count'],
          entries: [
            { symbol: '#', thread: { brand: 'DMC', code: '745' }, name: 'BANANA YELLOW', strands: 2, count: 748 },
          ],
        },
      ],
    }),
  )

  expect(textLines(pdf.pages[0])).toEqual([['1', '■', '745 - BANANA YELLOW', '748']])
})

test('a legend can print its symbols in another font, padded with blank glyphs either side', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: {
        StitchSquares: { glyphs: { 0x41: 'square' } },
        'StitchSquares,Bold': {
          glyphs: { 0x00: 'square', 0x20: 'square', 0x41: 'square' },
          unicode: { 0x00: '\u0000', 0x20: ' ' },
        },
      },
      symbols: { '#': { font: 'StitchSquares', code: 0x41 } },
      pages: [
        {
          type: 'legend',
          symbolFont: 'StitchSquares,Bold',
          paddedSymbols: true,
          entries: [{ symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 2 }],
        },
      ],
    }),
  )

  expect(
    pdf.pages[0].glyphs.filter(({ font }) => font.startsWith('Stitch')).map(({ font, code }) => [font, code]),
  ).toEqual([
    ['StitchSquares,Bold', 0x00],
    ['StitchSquares,Bold', 0x41],
    ['StitchSquares,Bold', 0x00],
    ['StitchSquares,Bold', 0x20],
  ])
})

test('a legend can space words by moving the text along, with no space characters', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSquares', code: 0x41 } },
      pages: [
        {
          type: 'legend',
          wordSpacing: 'moved',
          columns: ['symbol', 'name'],
          entries: [
            { symbol: '#', thread: { brand: 'DMC', code: '158' }, name: 'Cornflower Blue', strands: 2, count: 2 },
          ],
        },
      ],
    }),
  )

  const text = pdf.pages[0].glyphs.filter(({ font }) => font === 'Helvetica')
  expect(text.map(({ unicode }) => unicode).join('')).toBe('CornflowerBlue')
  const [r, b] = [text[9], text[10]]
  // An r is 3.33 points wide at this size; the rest is the gap.
  expect(b.x - r.x).toBeCloseTo(3.33 + 2.78, 1)
})

test('a legend can print several entries side by side on each line', async () => {
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
          columns: ['symbol', 'code', 'strands'],
          entriesPerLine: 2,
          entries: [
            { symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 2 },
            { symbol: '^', thread: { brand: 'DMC', code: '321' }, name: 'Red', strands: 1, count: 2 },
            { symbol: '#', thread: { brand: 'DMC', code: '3865' }, name: 'Winter White', strands: 2, count: 2 },
          ],
        },
      ],
    }),
  )

  expect(textLines(pdf.pages[0])).toEqual([
    ['■', '310', '2', '▲', '321', '1'],
    ['■', '3865', '2'],
  ])
})

test('a blend prints on one row, its threads, names and strands each joined by +', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSquares', code: 0x41 } },
      pages: [
        {
          type: 'legend',
          entries: [
            {
              symbol: '#',
              threads: [
                { thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 1 },
                { thread: { brand: 'DMC', code: '3371' }, name: 'Black Brown', strands: 1 },
              ],
              count: 40,
            },
          ],
        },
      ],
    }),
  )

  const page = pdf.pages[0]
  const [symbol] = page.glyphs.filter((glyph) => glyph.font === 'StitchSquares')
  const row = page.text
    .filter((text) => text.y === symbol.y && text.x > symbol.x)
    .sort((a, b) => a.x - b.x)
    .map((text) => text.str)
  expect(row).toEqual(['DMC 310 + DMC 3371', 'Black + Black Brown', '1+1', '40'])
})

test('a legend entry can print a color swatch between its symbol and its thread', async () => {
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
            { symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 4 },
            {
              symbol: '^',
              thread: { brand: 'Anchor', code: '403' },
              name: 'Black',
              strands: 2,
              count: 1,
              swatch: '#7F3FBF',
            },
          ],
        },
      ],
    }),
  )

  const page = pdf.pages[0]
  const symbol = page.glyphs.find((glyph) => glyph.font === 'StitchSquares' && glyph.code === 0x42)!
  const thread = page.text.find(({ str }) => str === 'Anchor')!
  expect(page.fills.map(({ color, x0, x1, y0 }) => ({ color, y0, between: x0 > symbol.x && x1 < thread.x }))).toEqual([
    { color: '#7f3fbf', y0: symbol.y, between: true },
  ])
})

test('a legend can print heading lines above its entries, in any script', async () => {
  const pdf = await readPdf(
    buildChartPdf({
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSquares', code: 0x41 } },
      pages: [
        {
          type: 'legend',
          headings: [
            { symbol: 'Символ', brand: 'Номер', name: 'Название', strands: 'Нитей', count: 'Крестиков' },
            { symbol: 'Symbol', brand: 'Number', name: 'Name', strands: 'Strands', count: 'Stitches' },
          ],
          entries: [{ symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 4 }],
        },
      ],
    }),
  )

  const page = pdf.pages[0]
  const [symbol] = page.glyphs.filter((glyph) => glyph.font === 'StitchSquares')
  const lines = [...new Set(page.text.map(({ y }) => y))]
    .sort((a, b) => b - a)
    .map((y) =>
      page.text
        .filter((text) => text.y === y)
        .sort((a, b) => a.x - b.x)
        .map((text) => text.str),
    )
  expect(lines).toEqual([
    ['Символ', 'Номер', 'Название', 'Нитей', 'Крестиков'],
    ['Symbol', 'Number', 'Name', 'Strands', 'Stitches'],
    ['■', 'DMC', '310', 'Black', '2', '4'],
  ])
  expect(page.text.find(({ str }) => str === 'DMC')!.y).toBe(symbol.y)
})

test('headings repeat over each entry that shares a line', async () => {
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
          columns: ['symbol', 'code', 'strands'],
          entriesPerLine: 2,
          headings: [{ symbol: 'Symbol', code: 'Number', strands: 'Strands' }],
          entries: [
            { symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: 2 },
            { symbol: '^', thread: { brand: 'DMC', code: '321' }, name: 'Red', strands: 1, count: 2 },
          ],
        },
      ],
    }),
  )

  const lines = textLines(pdf.pages[0])
  expect(lines).toEqual([
    ['Symbol', 'Number', 'Strands', 'Symbol', 'Number', 'Strands'],
    ['■', '310', '2', '▲', '321', '1'],
  ])
  const x = (str: string, nth = 0) => pdf.pages[0].text.filter((text) => text.str === str)[nth].x
  expect([x('Strands'), x('Strands', 1)]).toEqual([x('2'), x('1')])
})

test('a PDF can carry a title in its metadata, in any script, and has none by default', async () => {
  const describe = (title?: string) =>
    buildChartPdf({
      title,
      fonts: { StitchSquares: { glyphs: { 0x41: 'square' } } },
      symbols: { '#': { font: 'StitchSquares', code: 0x41 } },
      pages: [{ type: 'chart', cell: { width: 10, height: 10 }, grid: ['#'] }],
    })

  expect((await readPdf(describe('Рыжик (Ginger)'))).title).toBe('Рыжик (Ginger)')
  expect((await readPdf(describe())).title).toBeUndefined()
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
