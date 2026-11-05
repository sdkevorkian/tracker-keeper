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
            ['Символ', 'Номер', 'Название', 'Нитей', 'Крестиков'],
            ['Symbol', 'Number', 'Name', 'Strands', 'Stitches'],
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
