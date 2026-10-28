// Reads charts from page primitives. Only as wide as the simplest chart needs:
// one chart page with a solid grid of font symbols, and a legend page.
import type { LegendEntry, SymbolKey } from '../chart.ts'
import { bundledColor } from '../threads/colors.ts'
import type { Box, Glyph, PagePrimitives } from './extract.ts'

export interface ParsedChart {
  width: number
  height: number
  cells: Uint16Array
  legend: LegendEntry[]
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

function findGrid(page: PagePrimitives): Grid | undefined {
  const horizontal: number[] = []
  const vertical: number[] = []
  for (const path of page.paths) {
    if (!path.stroke) continue
    let from: [number, number] | undefined
    for (const command of path.commands) {
      if (command.type === 'line' && from) {
        const [x0, y0] = from
        const [x1, y1] = command.to
        if (Math.abs(y1 - y0) < TOLERANCE && Math.abs(x1 - x0) > TOLERANCE) horizontal.push(y0)
        if (Math.abs(x1 - x0) < TOLERANCE && Math.abs(y1 - y0) > TOLERANCE) vertical.push(x0)
      }
      from = command.type === 'move' || command.type === 'line' ? command.to : from
    }
  }
  const xs = distinct(vertical)
  const ys = distinct(horizontal).reverse()
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

/** Splits a line of text glyphs into columns at wide gaps. */
function columnsOf(glyphs: Glyph[]) {
  const columns: Glyph[][] = []
  for (const glyph of glyphs) {
    const last = columns.at(-1)
    const previous = last?.at(-1)
    const height = glyph.box.y1 - glyph.box.y0
    if (last && previous && glyph.box.x0 - previous.box.x1 < COLUMN_GAP * height) last.push(glyph)
    else columns.push([glyph])
  }
  return columns.map((column) => column.map((glyph) => glyph.unicode).join('').trim()).filter(Boolean)
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

export function parseCharts(pages: PagePrimitives[]): ParsedChart[] {
  const charts: { grid: Grid; placed: { cell: number; key: string }[] }[] = []
  const others: PagePrimitives[] = []
  for (const page of pages) {
    const grid = findGrid(page)
    const placed = grid && placeGlyphs(page, grid)
    if (grid && placed && !holdsText(placed)) charts.push({ grid, placed })
    else others.push(page)
  }
  const symbols = new Set(charts.flatMap(({ placed }) => placed.map(({ key }) => key)))
  const legend = others.flatMap((page) => linesOf(page.glyphs).flatMap((line) => readLegendRow(line, symbols) ?? []))
  const entryOf = new Map(legend.map((entry, i) => [symbolKey(entry.symbol), i + 1]))

  return charts.map(({ grid, placed }) => {
    const width = grid.xs.length - 1
    const height = grid.ys.length - 1
    const cells = new Uint16Array(width * height)
    for (const { cell, key } of placed) cells[cell] = entryOf.get(key) ?? 0
    return { width, height, cells, legend }
  })
}
