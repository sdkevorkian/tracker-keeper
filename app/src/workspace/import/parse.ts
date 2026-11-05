// Reads charts from page primitives: chart pages with a solid grid of font
// symbols, joined into one grid, and a legend page.
import type { ImportIssue, LegendEntry, Size, SourcePage, SymbolKey } from '../chart.ts'
import { bundledColor } from '../threads/colors.ts'
import type { Box, Glyph, PagePrimitives, Path } from './extract.ts'

export interface ParsedChart {
  width: number
  height: number
  cells: Uint16Array
  legend: LegendEntry[]
  /** Where each page of the PDF sits in the chart. */
  sourcePages: SourcePage[]
  importIssues: ImportIssue[]
}

/** Positions closer than this, in points, are the same line. */
const TOLERANCE = 0.5
/** A gap wider than this many font heights between glyphs starts a new legend column. */
const COLUMN_GAP = 0.6

interface Grid {
  /** Column edges, left to right. */
  xs: number[]
  /** Row edges, top to bottom. */
  ys: number[]
}

function symbolKey(symbol: SymbolKey) {
  return `${symbol.font}\u0000${symbol.code}`
}

function distinct(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.filter((value, i) => i === 0 || value - sorted[i - 1] > TOLERANCE)
}

/** How far a set of segments reaches along their line, counting overlaps once. */
function coverage(segments: { from: number; to: number }[]) {
  const sorted = [...segments].sort((a, b) => a.from - b.from)
  let covered = 0
  let end = -Infinity
  for (const { from, to } of sorted) {
    if (to > end) covered += to - Math.max(from, end)
    end = Math.max(end, to)
  }
  return covered
}

/**
 * Positions of lines that run across the grid. Grid lines all run the whole
 * way, so a position drawn for less than half as far as the furthest is
 * something else, such as a centre mark outside the grid. Strokes drawn on top
 * of each other, such as outlines around colored cells, count once.
 */
function gridLines(lines: { at: number; from: number; to: number }[]) {
  const positions = distinct(lines.map(({ at }) => at))
  const lengths = positions.map((position) => coverage(lines.filter(({ at }) => Math.abs(at - position) <= TOLERANCE)))
  const longest = Math.max(...lengths)
  return positions.filter((_, i) => lengths[i] >= longest / 2)
}

function findGrid(page: PagePrimitives): Grid | undefined {
  const horizontal: { at: number; from: number; to: number }[] = []
  const vertical: { at: number; from: number; to: number }[] = []
  for (const path of page.paths) {
    if (!path.stroke) continue
    let from: [number, number] | undefined
    for (const command of path.commands) {
      if (command.type === 'line' && from) {
        const [x0, y0] = from
        const [x1, y1] = command.to
        const [across, down] = [Math.abs(x1 - x0), Math.abs(y1 - y0)]
        if (down < TOLERANCE && across > TOLERANCE)
          horizontal.push({ at: y0, from: Math.min(x0, x1), to: Math.max(x0, x1) })
        if (across < TOLERANCE && down > TOLERANCE)
          vertical.push({ at: x0, from: Math.min(y0, y1), to: Math.max(y0, y1) })
      }
      from = command.type === 'move' || command.type === 'line' ? command.to : from
    }
  }
  const xs = gridLines(vertical)
  const ys = gridLines(horizontal).reverse()
  if (xs.length < 2 || ys.length < 2) return undefined
  return { xs, ys }
}

function centre(box: Box) {
  return { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }
}

/** The index of the band [edges[i], edges[i + 1]) holding `value`, if any. */
function band(edges: number[], value: number, descending = false) {
  for (let i = 0; i < edges.length - 1; i++) {
    const [a, b] = descending ? [edges[i + 1], edges[i]] : [edges[i], edges[i + 1]]
    if (value >= a && value < b) return i
  }
  return undefined
}

/** Numbers printed in a line of text, each with the box around its digits. */
function numbersIn(glyphs: Glyph[]) {
  return linesOf(glyphs).flatMap((line) =>
    wordsOf(line).flatMap((word) => {
      const value = word.map((glyph) => glyph.unicode).join('')
      if (!/^\d+$/.test(value)) return []
      const box = {
        x0: word[0].box.x0,
        y0: word[0].box.y0,
        x1: word.at(-1)!.box.x1,
        y1: word[0].box.y1,
      }
      return [{ value: Number(value), box }]
    }),
  )
}

/**
 * Where the page's top left cell sits in the whole chart (0-based), from the
 * row and column numbers printed above and left of its grid.
 */
function offsetFromMarginNumbers(page: PagePrimitives, grid: Grid) {
  const [left, right] = [grid.xs[0], grid.xs.at(-1)!]
  const [top, bottom] = [grid.ys[0], grid.ys.at(-1)!]
  const numbers = numbersIn(page.glyphs.filter((glyph) => !holdsSymbol(glyph, grid)))
  const column = numbers.flatMap(({ value, box }) => {
    const index = box.y0 > top ? band(grid.xs, centre(box).x) : undefined
    return index === undefined || centre(box).x > right ? [] : [value - 1 - index]
  })[0]
  const row = numbers.flatMap(({ value, box }) => {
    const index = box.x1 < left ? band(grid.ys, centre(box).y, true) : undefined
    return index === undefined || centre(box).y < bottom ? [] : [value - 1 - index]
  })[0]
  if (column === undefined || row === undefined) return undefined
  return { row, column }
}

function holdsSymbol(glyph: Glyph, grid: Grid) {
  const { x, y } = centre(glyph.box)
  return band(grid.xs, x) !== undefined && band(grid.ys, y, true) !== undefined
}

function placeGlyphs(page: PagePrimitives, grid: Grid) {
  const width = grid.xs.length - 1
  const placed: { cell: number; key: string }[] = []
  for (const glyph of page.glyphs) {
    const { x, y } = centre(glyph.box)
    const column = band(grid.xs, x)
    const row = band(grid.ys, y, true)
    if (column === undefined || row === undefined) continue
    placed.push({ cell: row * width + column, key: symbolKey(glyph) })
  }
  return placed
}

/**
 * A chart cell holds at most one mark; a table cell holds words. A grid whose
 * occupied cells mostly hold several glyphs is a table, such as an info page.
 * Empty grids still count as charts, so a real chart is never dropped here.
 */
function holdsText(placed: { cell: number }[]) {
  const perCell = new Map<number, number>()
  for (const { cell } of placed) perCell.set(cell, (perCell.get(cell) ?? 0) + 1)
  const crowded = [...perCell.values()].filter((count) => count > 1).length
  return crowded > perCell.size / 2
}

/**
 * Groups glyphs into lines, top to bottom, each left to right. Fonts differ in
 * ascent and descent, so a glyph joins a line when its middle lies inside the
 * line's first glyph.
 */
function linesOf(glyphs: Glyph[]) {
  const lines: Glyph[][] = []
  const sorted = [...glyphs].sort((a, b) => centre(b.box).y - centre(a.box).y)
  for (const glyph of sorted) {
    const last = lines.at(-1)
    const middle = centre(glyph.box).y
    if (last && middle >= last[0].box.y0 && middle <= last[0].box.y1) last.push(glyph)
    else lines.push([glyph])
  }
  return lines.map((line) => line.sort((a, b) => a.box.x0 - b.box.x0))
}

/** Splits a line of glyphs into runs at wide gaps. */
function wordsOf(glyphs: Glyph[]) {
  const words: Glyph[][] = []
  for (const glyph of glyphs) {
    const last = words.at(-1)
    const previous = last?.at(-1)
    const height = glyph.box.y1 - glyph.box.y0
    if (last && previous && glyph.box.x0 - previous.box.x1 < COLUMN_GAP * height) last.push(glyph)
    else words.push([glyph])
  }
  return words
}

/** Splits a line of text glyphs into columns at wide gaps. */
function columnsOf(glyphs: Glyph[]) {
  return wordsOf(glyphs)
    .map((column) =>
      column
        .map((glyph) => glyph.unicode)
        .join('')
        .trim(),
    )
    .filter(Boolean)
}

function readLegendRow(line: Glyph[], symbols: Set<string>): LegendEntry | undefined {
  const [first, ...rest] = line
  if (!symbols.has(symbolKey(first))) return undefined
  const columns = columnsOf(rest)
  if (columns.length < 5) return undefined
  const [brand, code, ...more] = columns
  const count = Number(more.pop())
  const strands = Number(more.pop())
  if (!Number.isInteger(count) || !Number.isInteger(strands)) return undefined
  return {
    symbol: { font: first.font, code: first.code },
    threads: [{ brand, code, name: more.join(' '), strands }],
    color: bundledColor({ brand, code }),
    printedCount: count,
  }
}

interface ChartPage {
  /** The page's number in the PDF, from 1. */
  page: number
  width: number
  height: number
  placed: { cell: number; key: string }[]
  /** Where the page's top left cell sits in the whole chart (0-based), when its margins say. */
  offset?: { row: number; column: number }
  /** How many of its first columns and rows the page shades as repeated from the pages before it. */
  shaded: { columns: number; rows: number }
  /** Whether anything is filled in inside the grid, such as colored cells. */
  filled: boolean
}

type PlacedPage = ChartPage & { offset: { row: number; column: number } }

interface JoinedChart {
  width: number
  height: number
  placed: { cell: number; key: string }[]
  pages: PlacedPage[]
}

/** Lays pages whose margins place them into one grid. Repeated cells are written once per page, with the same value. */
function joinPages(pages: PlacedPage[]): JoinedChart {
  const width = Math.max(...pages.map((page) => page.offset.column + page.width))
  const height = Math.max(...pages.map((page) => page.offset.row + page.height))
  const placed = pages.flatMap((page) =>
    page.placed.map(({ cell, key }) => {
      const row = page.offset.row + Math.floor(cell / page.width)
      const column = page.offset.column + (cell % page.width)
      return { cell: row * width + column, key }
    }),
  )
  return { width, height, placed, pages }
}

// How chart software prints a chart's size: '80W x 60H' on an info page, or '80 x 60 stitches'.
const PRINTED_SIZES = [/(\d+)\s*W\s*[x×]\s*(\d+)\s*H\b/i, /(\d+)\s*[x×]\s*(\d+)\s*stitches\b/i]

/** The chart size printed on the PDF's other pages, if any, in stitches. */
function printedSizeIn(pages: PagePrimitives[]): Size | undefined {
  for (const page of pages) {
    for (const line of linesOf(page.glyphs)) {
      const text = columnsOf(line).join(' ')
      for (const pattern of PRINTED_SIZES) {
        const size = pattern.exec(text)
        if (size) return { width: Number(size[1]), height: Number(size[2]) }
      }
    }
  }
  return undefined
}

function boxOfPath(path: Path): Box {
  const points = path.commands.flatMap((command) =>
    command.type === 'curve' ? command.points : command.type === 'close' ? [] : [command.to],
  )
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/**
 * Chart software shades the rows and columns a page repeats from the page
 * before it: a fill along the grid's left edge for its whole height, or along
 * its top edge for its whole width. Counts how many of each it covers.
 */
function shadedOverlap(page: PagePrimitives, grid: Grid) {
  const [left, right] = [grid.xs[0], grid.xs.at(-1)!]
  const [top, bottom] = [grid.ys[0], grid.ys.at(-1)!]
  const near = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE
  const shaded = { columns: 0, rows: 0 }
  for (const path of page.paths) {
    if (!path.fill || path.stroke) continue
    const box = boxOfPath(path)
    if (near(box.x0, left) && near(box.y0, bottom) && near(box.y1, top) && box.x1 < right - TOLERANCE) {
      shaded.columns = Math.max(
        shaded.columns,
        grid.xs.filter((x) => x > left + TOLERANCE && x <= box.x1 + TOLERANCE).length,
      )
    }
    if (near(box.y1, top) && near(box.x0, left) && near(box.x1, right) && box.y0 > bottom + TOLERANCE) {
      shaded.rows = Math.max(shaded.rows, grid.ys.filter((y) => y < top - TOLERANCE && y >= box.y0 - TOLERANCE).length)
    }
  }
  return shaded
}

/** Whether any filled shape sits inside the grid. */
function fillsCells(page: PagePrimitives, grid: Grid) {
  return page.paths.some((path) => {
    if (!path.fill) return false
    const { x, y } = centre(boxOfPath(path))
    return band(grid.xs, x) !== undefined && band(grid.ys, y, true) !== undefined
  })
}

/** Each cell's symbol key, row by row, '' for a blank cell. */
function keysOf(page: ChartPage) {
  const keys = Array<string>(page.width * page.height).fill('')
  for (const { cell, key } of page.placed) keys[cell] = key
  return keys
}

/** Whether `a`'s last `k` columns hold the same symbols as `b`'s first `k`. */
function repeatsColumns(a: ChartPage, b: ChartPage, k: number) {
  const [left, right] = [keysOf(a), keysOf(b)]
  for (let row = 0; row < a.height; row++) {
    for (let i = 0; i < k; i++) {
      if (left[row * a.width + a.width - k + i] !== right[row * b.width + i]) return false
    }
  }
  return true
}

/** Whether `a`'s last `k` rows hold the same symbols as `b`'s first `k`. */
function repeatsRows(a: ChartPage, b: ChartPage, k: number) {
  const [top, bottom] = [keysOf(a), keysOf(b)]
  for (let j = 0; j < k; j++) {
    for (let column = 0; column < a.width; column++) {
      if (top[(a.height - k + j) * a.width + column] !== bottom[j * b.width + column]) return false
    }
  }
  return true
}

/**
 * The fewest stitches every neighbouring pair repeats, or 0 when they repeat
 * none. Designers repeat only a few, and a pattern that itself repeats would
 * also match at every multiple of the real overlap.
 */
function overlapOf(
  pairs: [ChartPage, ChartPage][],
  size: number,
  repeats: typeof repeatsRows,
  shaded: (page: ChartPage) => number,
) {
  // Pages that shade what they repeat say how much that is, even where the repeated stitches are blank.
  const marked = new Set(pairs.map(([, page]) => shaded(page)))
  if (marked.size === 1) {
    const [k] = marked
    if (k > 0) return pairs.every(([a, b]) => repeats(a, b, k)) ? k : 0
  }
  for (let k = 1; k < size; k++) {
    if (pairs.every(([a, b]) => repeats(a, b, k))) return k
  }
  return 0
}

/**
 * Places pages without margin numbers by the rows and columns neighbouring
 * pages repeat. Pages run in reading order, left to right and then down, and
 * repeat the same number of stitches all through the chart. Undefined when no
 * layout has every neighbouring pair repeating stitches.
 */
function placeByOverlap(pages: ChartPage[]): PlacedPage[] | undefined {
  if (pages.length < 2) return undefined
  for (let across = 1; across <= pages.length; across++) {
    if (pages.length % across) continue
    const rows = Array.from({ length: pages.length / across }, (_, row) =>
      pages.slice(row * across, (row + 1) * across),
    )
    const columns = rows[0].map((_, column) => rows.map((row) => row[column]))
    const sameHeights = rows.every((row) => row.every((page) => page.height === row[0].height))
    const sameWidths = columns.every((column) => column.every((page) => page.width === column[0].width))
    if (!sameHeights || !sameWidths) continue
    const minimum = (sizes: number[]) => Math.min(...sizes)
    const columnOverlap = overlapOf(
      rows.flatMap((row) => row.slice(1).map((page, i): [ChartPage, ChartPage] => [row[i], page])),
      minimum(pages.map((page) => page.width)),
      repeatsColumns,
      (page) => page.shaded.columns,
    )
    const rowOverlap = overlapOf(
      columns.flatMap((column) => column.slice(1).map((page, i): [ChartPage, ChartPage] => [column[i], page])),
      minimum(pages.map((page) => page.height)),
      repeatsRows,
      (page) => page.shaded.rows,
    )
    if ((columns.length > 1 && !columnOverlap) || (rows.length > 1 && !rowOverlap)) continue
    const columnStarts = columns.map((_, c) =>
      columns.slice(0, c).reduce((sum, [page]) => sum + page.width - columnOverlap, 0),
    )
    const rowStarts = rows.map((_, r) => rows.slice(0, r).reduce((sum, [page]) => sum + page.height - rowOverlap, 0))
    return rows.flatMap((row, r) =>
      row.map((page, c) => ({ ...page, offset: { row: rowStarts[r], column: columnStarts[c] } })),
    )
  }
  return undefined
}

/**
 * Splits chart pages printed one after another into printings, each one PDF
 * style of one chart. A page whose margins place it where an earlier page of
 * the same printing already sits starts the next printing.
 */
function printingsOf(run: ChartPage[]): JoinedChart[] {
  const numbered: PlacedPage[][] = []
  for (const page of run) {
    if (!page.offset) continue
    const current = numbered.at(-1)
    const placed = page as PlacedPage
    const repeats = current?.some(
      ({ offset }) => offset.row === placed.offset.row && offset.column === placed.offset.column,
    )
    if (current && !repeats) current.push(placed)
    else numbered.push([placed])
  }
  const unnumbered = repeatsOf(run.filter((page) => !page.offset)).flatMap((pages) => {
    const overlapping = placeByOverlap(pages)
    return overlapping
      ? [joinPages(overlapping)]
      : pages.map((page) => joinPages([{ ...page, offset: { row: 0, column: 0 } }]))
  })
  return [...numbered.map(joinPages), ...unnumbered].sort((a, b) => a.pages[0].page - b.pages[0].page)
}

/** Whether two pages could be the same page in different PDF styles: the same size, with the same symbol wherever both print one. */
function samePage(a: ChartPage, b: ChartPage) {
  if (a.width !== b.width || a.height !== b.height) return false
  const [left, right] = [keysOf(a), keysOf(b)]
  return left.every((key, i) => !key || !right[i] || key === right[i])
}

/**
 * Splits pages with no margin numbers into printings of the same chart: the
 * shortest run of pages that the rest repeat, page for page, in other PDF styles.
 */
function repeatsOf(pages: ChartPage[]): ChartPage[][] {
  for (let length = 1; length < pages.length; length++) {
    if (pages.length % length) continue
    if (pages.every((page, i) => i < length || samePage(pages[i - length], page))) {
      return Array.from({ length: pages.length / length }, (_, i) => pages.slice(i * length, (i + 1) * length))
    }
  }
  return pages.length ? [pages] : []
}

/** Each cell's symbol key, row by row, '' for a blank cell. */
function keysOfChart({ width, height, placed }: JoinedChart) {
  const keys = Array<string>(width * height).fill('')
  for (const { cell, key } of placed) keys[cell] = key
  return keys
}

/** Whether two printings could be the same chart: the same size, with the same symbol wherever both print one. */
function samePrinted(a: JoinedChart, b: JoinedChart) {
  if (a.width !== b.width || a.height !== b.height) return false
  const [left, right] = [keysOfChart(a), keysOfChart(b)]
  return left.every((key, i) => !key || !right[i] || key === right[i])
}

/** How many cells a printing prints a symbol in. */
function symbolCells(printing: JoinedChart) {
  return keysOfChart(printing).filter(Boolean).length
}

interface Design {
  /** The printing the chart is read from. */
  chart: JoinedChart
  /** The design's first page in the PDF, from 1. */
  firstPage: number
}

/** Groups printings of the same chart, and reads each chart from the printing with the most symbols. */
function designsOf(printings: JoinedChart[]): Design[] {
  const groups: JoinedChart[][] = []
  for (const printing of printings) {
    const group = groups.find((members) => members.every((other) => samePrinted(other, printing)))
    if (group) group.push(printing)
    else groups.push([printing])
  }
  return groups.map((group) => ({
    chart: group.reduce((best, printing) => (symbolCells(printing) > symbolCells(best) ? printing : best)),
    firstPage: group[0].pages[0].page,
  }))
}

export function parseCharts(pages: PagePrimitives[]): ParsedChart[] {
  const runs: ChartPage[][] = []
  const others: { page: number; primitives: PagePrimitives }[] = []
  let run: ChartPage[] | undefined
  for (const [index, page] of pages.entries()) {
    const grid = findGrid(page)
    const placed = grid && placeGlyphs(page, grid)
    if (grid && placed && !holdsText(placed)) {
      if (!run) runs.push((run = []))
      run.push({
        page: index + 1,
        width: grid.xs.length - 1,
        height: grid.ys.length - 1,
        placed,
        offset: offsetFromMarginNumbers(page, grid),
        shaded: shadedOverlap(page, grid),
        filled: fillsCells(page, grid),
      })
    } else {
      others.push({ page: index + 1, primitives: page })
      run = undefined
    }
  }
  const designs = designsOf(runs.flatMap(printingsOf))

  return designs.map(({ chart, firstPage }, i) => {
    // A design's legend and info pages follow its chart pages, up to the next design. Any before the first design are its.
    const until = designs[i + 1]?.firstPage ?? Infinity
    const own = others
      .filter(({ page }) => page < until && (i === 0 || page > firstPage))
      .map(({ primitives }) => primitives)
    const { width, height, placed } = chart
    const symbols = new Set(placed.map(({ key }) => key))
    const legend = own.flatMap((page) => linesOf(page.glyphs).flatMap((line) => readLegendRow(line, symbols) ?? []))
    const entryOf = new Map(legend.map((entry, n) => [symbolKey(entry.symbol), n + 1]))
    const printed = printedSizeIn(own)
    const cells = new Uint16Array(width * height)
    for (const { cell, key } of placed) cells[cell] = entryOf.get(key) ?? 0
    const sourcePages = chart.pages.map(({ page, offset, ...size }) => ({
      page,
      across: [offset.column + 1, offset.column + size.width] as [number, number],
      down: [offset.row + 1, offset.row + size.height] as [number, number],
    }))
    const importIssues: ImportIssue[] = []
    if (printed && (printed.width !== width || printed.height !== height)) {
      importIssues.push({ kind: 'size mismatch', printed, parsed: { width, height } })
    }
    if (placed.length === 0 && chart.pages.some((page) => page.filled)) importIssues.push({ kind: 'no symbols' })
    return { width, height, cells, legend, sourcePages, importIssues }
  })
}
