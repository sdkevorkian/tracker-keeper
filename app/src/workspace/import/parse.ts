// Reads charts from page primitives: chart pages with a solid grid of font
// symbols, joined into one grid, and a legend page.
import type { ImportIssue, LegendEntry, Size, SourcePage, SymbolKey } from '../chart.ts'
import { bundledColor } from '../threads/colors.ts'
import type { Box, Glyph, PagePrimitives, Path, PdfPrimitives } from './extract.ts'

export interface ParsedChart {
  /** The chart's title, where the PDF prints one. */
  title?: string
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
/** A gap wider than this many font heights between glyphs, with no space character, is a space between words. */
const WORD_GAP = 0.15

interface Grid {
  /** Column edges, left to right. */
  xs: number[]
  /** Row edges, top to bottom. */
  ys: number[]
}

function symbolKey(symbol: SymbolKey) {
  return `${symbol.font}\u0000${symbol.code}`
}

function symbolOf(key: string): SymbolKey {
  const [font, code] = key.split('\u0000')
  return { font, code: Number(code) }
}

function distinct(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.filter((value, i) => i === 0 || value - sorted[i - 1] > TOLERANCE)
}

/** Gaps no wider than this, in points, between strokes along a line are the gaps in a dotted or dashed line. */
const DASH_GAP = 2

/**
 * How far a set of segments reaches along their line, counting overlaps once
 * and the gaps in a dotted or dashed line as drawn.
 */
function coverage(segments: { from: number; to: number }[]) {
  const sorted = [...segments].sort((a, b) => a.from - b.from)
  let covered = 0
  let end = -Infinity
  for (const { from, to } of sorted) {
    if (to > end) covered += to - (from - end <= DASH_GAP ? end : from)
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

/** A filled shape no thicker than this, in points, and longer than it is thick, is a line drawn as a thin rectangle. */
const MAX_RULE_WIDTH = 1.5

/** The line along the middle of a thin filled rectangle, if `path` is one. */
function ruleOf(path: Path) {
  if (!path.fill || path.stroke) return undefined
  const box = boxOfPath(path)
  const [across, down] = [box.x1 - box.x0, box.y1 - box.y0]
  if (down <= MAX_RULE_WIDTH && across > down) {
    return { direction: 'horizontal' as const, at: (box.y0 + box.y1) / 2, from: box.x0, to: box.x1 }
  }
  if (across <= MAX_RULE_WIDTH && down > across) {
    return { direction: 'vertical' as const, at: (box.x0 + box.x1) / 2, from: box.y0, to: box.y1 }
  }
  return undefined
}

type Segment = { at: number; from: number; to: number }

/** The parts of segments that lie between the first and last of `edges`. */
function within(segments: Segment[], edges: number[]) {
  if (edges.length < 2) return segments
  const [low, high] = [edges[0], edges.at(-1)!]
  return segments.flatMap(({ at, from, to }) => {
    const [start, end] = [Math.max(from, low), Math.min(to, high)]
    return end > start ? [{ at, from: start, to: end }] : []
  })
}

/** How far, as a share of the gap, a grid line may sit from even spacing. */
const SPACING_SLACK = 0.25

/**
 * The longest run of neighbouring positions spaced evenly, as a grid's lines
 * are. Lines that break the spacing, such as a logo's frame, aren't the
 * grid's. Of runs as long, the most closely spaced is, since cells are smaller
 * than anything else drawn on a chart page.
 */
function evenlySpaced(positions: number[]) {
  let best = positions.slice(0, 1)
  let bestGap = Infinity
  for (let start = 0; start < positions.length - 1; start++) {
    const gap = positions[start + 1] - positions[start]
    let end = start + 1
    // A line drawn twice to thicken it sits a little off its place, so gaps may differ by part of a cell.
    while (end + 1 < positions.length && Math.abs(positions[end + 1] - positions[end] - gap) <= gap * SPACING_SLACK)
      end++
    const length = end - start + 1
    if (length > best.length || (length === best.length && gap < bestGap)) {
      best = positions.slice(start, end + 1)
      bestGap = gap
    }
  }
  return best
}

function findGrid(page: PagePrimitives): Grid | undefined {
  const horizontal: { at: number; from: number; to: number }[] = []
  const vertical: { at: number; from: number; to: number }[] = []
  for (const path of page.paths) {
    // Some chart software draws grid lines as thin filled rectangles instead of strokes.
    const rule = ruleOf(path)
    if (rule) (rule.direction === 'horizontal' ? horizontal : vertical).push(rule)
    if (!path.stroke) continue
    let from: [number, number] | undefined
    for (const command of path.commands) {
      if (command.type === 'line' && from) {
        const [x0, y0] = from
        const [x1, y1] = command.to
        const [across, down] = [Math.abs(x1 - x0), Math.abs(y1 - y0)]
        // The dots of a dotted line can be shorter than TOLERANCE, so a segment's direction is all that counts.
        if (down < TOLERANCE && across > down) horizontal.push({ at: y0, from: Math.min(x0, x1), to: Math.max(x0, x1) })
        if (across < TOLERANCE && down > across) vertical.push({ at: x0, from: Math.min(y0, y1), to: Math.max(y0, y1) })
      }
      from = command.type === 'move' || command.type === 'line' ? command.to : from
    }
  }
  // Lines beside the grid, such as a logo's frame, can make grid lines look short, so each side is measured again within the other.
  const firstYs = evenlySpaced(gridLines(horizontal))
  const xs = evenlySpaced(gridLines(within(vertical, firstYs)))
  const ys = evenlySpaced(gridLines(within(horizontal, xs))).reverse()
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

/** A glyph that prints nothing: code 0, or a space. Chart software pads symbols and fills blank cells with them. */
function isBlank(glyph: Glyph) {
  return glyph.code === 0 || glyph.code === 0x20
}

function placeGlyphs(page: PagePrimitives, grid: Grid) {
  const width = grid.xs.length - 1
  const placed: { cell: number; key: string }[] = []
  for (const glyph of page.glyphs) {
    if (isBlank(glyph)) continue
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

/**
 * The text of a run of glyphs. Some PDFs space words by moving the text
 * along instead of printing a space, so a gap between glyphs is a space too.
 */
function textOf(glyphs: Glyph[]) {
  return glyphs
    .map((glyph, i) => {
      const previous = glyphs[i - 1]
      if (!previous || previous.unicode === ' ' || glyph.unicode === ' ') return glyph.unicode
      const gap = glyph.box.x0 - previous.box.x1
      return gap > WORD_GAP * (glyph.box.y1 - glyph.box.y0) ? ` ${glyph.unicode}` : glyph.unicode
    })
    .join('')
    .trim()
}

/** Splits a line of text glyphs into columns at wide gaps. */
function columnsOf(glyphs: Glyph[]) {
  return wordsOf(glyphs).map(textOf).filter(Boolean)
}

/** The color of a swatch printed on a legend row: a filled shape beside its symbol, no taller than the symbol. */
function swatchColor(symbol: Glyph, fills: Path[]) {
  const height = symbol.box.y1 - symbol.box.y0
  const swatch = fills.find((path) => {
    const box = boxOfPath(path)
    const { y } = centre(box)
    return y >= symbol.box.y0 && y <= symbol.box.y1 && box.y1 - box.y0 <= height && box.x0 >= symbol.box.x1
  })
  return swatch?.fillColor
}

/**
 * A thread as a legend prints it, such as 'DMC 310' or 'DMC BLANC': the brand,
 * then the code as the last word. A bare code takes the brand the PDF names
 * for the whole legend, if it names one.
 */
function readThread(text: string, brand?: string) {
  const words = text.trim().split(/\s+/)
  if (words.length === 1) return brand ? { brand, code: words[0] } : undefined
  return { brand: words.slice(0, -1).join(' '), code: words.at(-1)! }
}

/** How a PDF names the one brand its legend uses, as in 'Floss: DMC' or 'PALETTE: DMC'. */
const LEGEND_BRAND = /\b(?:floss|palette)\s*:\s*(\p{L}[\p{L}\d-]*)/iu

/** The brand the PDF names for its whole legend, if any. */
function legendBrandIn(pages: PagePrimitives[]) {
  for (const page of pages) {
    for (const line of linesOf(page.glyphs)) {
      const brand = LEGEND_BRAND.exec(columnsOf(line).join(' '))
      if (brand) return brand[1]
    }
  }
  return undefined
}

/** Amounts a legend prints that the chart doesn't need, such as '0.8 Skeins' or a thread length of '3.30'. */
const AMOUNT = /^\d+[.,]\d+|skein/i
/** Strands or a stitch count: a whole number, or strands per thread of a blend such as '1+1'. */
const NUMBER = /^\d+(\+\d+)*$/
/** More strands than this in one needle is a stitch count, not strands. */
const MOST_STRANDS = 6

/** A run of text on a page, and the box around it. */
interface Word {
  text: string
  box: Box
}

/** A line's words, split at wide gaps. */
function textWordsOf(glyphs: Glyph[]): Word[] {
  return wordsOf(glyphs).flatMap((word) => {
    const text = textOf(word)
    if (!text) return []
    const box = { x0: word[0].box.x0, y0: word[0].box.y0, x1: word.at(-1)!.box.x1, y1: word[0].box.y1 }
    return [{ text, box }]
  })
}

/**
 * The chart symbol font that a legend glyph's font stands for: the same font,
 * or another style of it, as when a legend prints 'X' and the chart 'X,Bold'.
 */
function chartFontFor(font: string, chartFonts: Set<string>) {
  if (chartFonts.has(font)) return font
  const family = font.split(',')[0]
  return [...chartFonts].find((chartFont) => chartFont.split(',')[0] === family)
}

/** What a legend page says about the rows on it. */
interface LegendPageContext {
  /** The chart symbol font a glyph's font stands for, or undefined when the glyph isn't a symbol. */
  symbolFontFor: (font: string) => string | undefined
  /** Filled shapes on the page, which may be swatches. */
  fills: Path[]
  /** The brand the PDF names for the whole legend, for rows that print only a code. */
  brand?: string
  /** Words on lines with no symbol, such as column headings. */
  headings: Word[]
}

/** What a column heading says the numbers under it are, if it says. */
function headedAs(number: Word, headings: Word[]) {
  const above = headings.filter(({ box }) => box.y0 > number.box.y1 && box.x0 < number.box.x1 && box.x1 > number.box.x0)
  const heading = above.map(({ text }) => text).join(' ')
  if (/strand|нит/i.test(heading)) return 'strands'
  if (/stitch|крест/i.test(heading)) return 'count'
  return undefined
}

/**
 * Where a legend row's thread ends: its first column, or its first two when
 * the first is a brand on its own, as in 'DMC' then '310'.
 */
function threadColumns(columns: string[]) {
  return /^\p{L}+$/u.test(columns[0]) && columns.length > 1 ? 2 : 1
}

/** A thread printed with its name after a dash, as in '745 - BANANA YELLOW', split into the two. */
function splitCodeName(text: string): [thread: string, name?: string] {
  const parts = /^(.+?)\s+-\s+(.+)$/.exec(text)
  return parts ? [parts[1], parts[2]] : [text]
}

/**
 * A row's strands and printed count, from the whole numbers it prints after
 * its thread. A lone number is whatever its column heading says, or else
 * strands when it's small enough to be.
 */
function strandsAndCount(numbers: Word[], headings: Word[]): { strands?: string; count?: string } | undefined {
  if (numbers.length === 2) return { strands: numbers[0].text, count: numbers[1].text }
  if (numbers.length > 2) return undefined
  const [number] = numbers
  if (number === undefined) return {}
  const kind =
    headedAs(number, headings) ??
    (number.text.includes('+') || Number(number.text) <= MOST_STRANDS ? 'strands' : 'count')
  return kind === 'strands' ? { strands: number.text } : { count: number.text }
}

/**
 * Splits a line of a legend page into entries, each starting at a symbol, as
 * when a legend prints several entries side by side. Anything before the
 * first symbol isn't part of an entry.
 */
function legendEntriesIn(line: Glyph[], symbolFontFor: LegendPageContext['symbolFontFor']) {
  const entries: Glyph[][] = []
  for (const glyph of line) {
    // Some legends pad each symbol with blank glyphs from its font.
    if (symbolFontFor(glyph.font) && isBlank(glyph)) continue
    if (symbolFontFor(glyph.font)) entries.push([glyph])
    else entries.at(-1)?.push(glyph)
  }
  return entries
}

/**
 * A legend row: the symbol, then its thread or threads, and any of a name,
 * strands and printed stitch count. Columns are read by what they hold, since
 * legends print different columns in different orders. A blend joins its
 * threads, names and strands with +.
 */
function readLegendRow(line: Glyph[], page: LegendPageContext): LegendEntry | undefined {
  const [first, ...rest] = line
  const font = page.symbolFontFor(first.font)
  if (!font) return undefined
  const words = textWordsOf(rest).filter(({ text }) => !AMOUNT.test(text))
  const columns = words.map(({ text }) => text)
  if (columns.length === 0) return undefined
  const split = threadColumns(columns)
  // Some legends print the code and name together, as in '745 - BANANA YELLOW'.
  const [threadText, codeName] = splitCodeName(columns.slice(0, split).join(' '))
  const threads = threadText.split('+').map((text) => readThread(text, page.brand))
  const after = words.slice(split)
  const numbers = strandsAndCount(
    after.filter(({ text }) => NUMBER.test(text)),
    page.headings,
  )
  const name = [
    ...(codeName ? [codeName] : []),
    ...after.filter(({ text }) => !NUMBER.test(text)).map(({ text }) => text),
  ].join(' ')
  if (!numbers || !threads.every((thread) => thread !== undefined)) return undefined
  const names = name ? name.split(' + ') : undefined
  const strands = numbers.strands?.split('+').map(Number)
  if (names && names.length !== threads.length) return undefined
  if (strands && strands.length !== threads.length) return undefined
  return {
    symbol: { font, code: first.code },
    threads: threads.map((thread, i) => ({
      ...thread,
      ...(names && { name: names[i].trim() }),
      ...(strands && { strands: strands[i] }),
    })),
    color: (threads.length === 1 ? bundledColor(threads[0]) : undefined) ?? swatchColor(first, page.fills),
    ...(numbers.count !== undefined && { printedCount: Number(numbers.count) }),
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

/** A line labelled 'Title', as on an info page, in a table or after a colon. */
const PRINTED_TITLE = /^title\s*:?\s+(.+)$/i

/** The chart's title printed on the PDF's other pages, if any. */
function printedTitleIn(pages: PagePrimitives[]) {
  for (const page of pages) {
    for (const line of linesOf(page.glyphs)) {
      const title = PRINTED_TITLE.exec(columnsOf(line).join(' '))
      if (title) return title[1].trim()
    }
  }
  return undefined
}

/** Titles PDF software writes to the metadata when the author gave none. */
const PLACEHOLDER_TITLES = /^(document|untitled)?$/i

/** The metadata's title, unless it is a placeholder. */
function realTitle(title: string | undefined) {
  const trimmed = title?.trim()
  return trimmed && !PLACEHOLDER_TITLES.test(trimmed) ? trimmed : undefined
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

/** Whether any filled shape sits inside the grid, other than grid lines drawn as thin rectangles. */
function fillsCells(page: PagePrimitives, grid: Grid) {
  return page.paths.some((path) => {
    if (!path.fill || ruleOf(path)) return false
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

/** The indexes of the cells holding `value`. */
function cellsOf(cells: Uint16Array, value: number) {
  const found: number[] = []
  cells.forEach((cell, i) => {
    if (cell === value) found.push(i)
  })
  return found
}

export function parseCharts({ title: metadataTitle, pages }: PdfPrimitives): ParsedChart[] {
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
    // Legend rows start with a symbol in a font the chart's symbols use, even when the chart doesn't use that symbol.
    const symbolFonts = new Set(placed.map(({ key }) => symbolOf(key).font))
    const symbolFontFor = (font: string) => chartFontFor(font, symbolFonts)
    const brand = legendBrandIn(own)
    const rows = own.flatMap((page) => {
      const lines = linesOf(page.glyphs)
      const context: LegendPageContext = {
        symbolFontFor,
        fills: page.paths.filter((path) => path.fill && !path.stroke),
        brand,
        headings: lines
          .filter((line) => !line.some((glyph) => symbolFontFor(glyph.font)))
          .flatMap((line) => textWordsOf(line)),
      }
      return lines.flatMap((line) =>
        legendEntriesIn(line, symbolFontFor).flatMap((entry) => readLegendRow(entry, context) ?? []),
      )
    })
    // A PDF may print the same legend on more than one page; a symbol's first entry is its own.
    const legend = rows.filter(
      (row, n) => rows.findIndex((other) => symbolKey(other.symbol) === symbolKey(row.symbol)) === n,
    )
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
    legend.forEach(({ printedCount }, index) => {
      const entry = index + 1
      const entryCells = cellsOf(cells, entry)
      if (entryCells.length === 0) {
        importIssues.push({ kind: 'legend entry with no stitches', entry })
      } else if (printedCount !== undefined && entryCells.length !== printedCount) {
        importIssues.push({
          kind: 'legend count mismatch',
          entry,
          printed: printedCount,
          parsed: entryCells.length,
          cells: entryCells,
        })
      }
    })
    // Pages that repeat stitches place them more than once, so cells are gathered in sets.
    const unlisted = new Map<string, Set<number>>()
    for (const { cell, key } of placed) {
      if (!entryOf.has(key)) unlisted.set(key, (unlisted.get(key) ?? new Set()).add(cell))
    }
    for (const [key, unlistedCells] of unlisted) {
      importIssues.push({
        kind: 'symbol not in legend',
        symbol: symbolOf(key),
        cells: [...unlistedCells].sort((a, b) => a - b),
      })
    }
    return {
      title: printedTitleIn(own) ?? realTitle(metadataTitle),
      width,
      height,
      cells,
      legend,
      sourcePages,
      importIssues,
    }
  })
}
