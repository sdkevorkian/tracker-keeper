// Builds synthetic chart PDFs for tests from a short description, so no
// fixture is ever derived from a real chart. Fonts are generated, not committed.
import { buildTrueTypeFont, type Shape } from './trueTypeFont.ts'

export interface ChartPdfDescription {
  /** Embedded symbol fonts, by the name written to the PDF. */
  fonts: Record<string, FontDescription>
  /** The chart's symbols, by the one-character name chart grids and legend entries use. */
  symbols: Record<string, SymbolDescription>
  pages: PageDescription[]
}

export interface FontDescription {
  /** Character code (0–255) to the shape drawn for it. */
  glyphs: Record<number, Shape>
  /** Set to false to leave out the ToUnicode map, as some chart PDFs do. */
  toUnicode?: boolean
}

export interface SymbolDescription {
  font: string
  code: number
}

export type PageDescription = ChartPage | LegendPage | TextPage | TablePage

export interface ChartPage {
  type: 'chart'
  /** Cell size in points. Cells need not be square. */
  cell: { width: number; height: number }
  /** One string per row, one symbol name per cell, '.' for a blank cell. */
  grid: string[]
  /** Stitches per page. A larger grid is split over several pages, row by row. */
  pageSize?: { width: number; height: number }
  /** How many rows and columns neighbouring pages repeat. None by default. */
  overlap?: number
  /** Prints every 10th row and column number of the whole chart in the margins, as chart software does. */
  marginNumbers?: boolean
  /** Shades the rows and columns a page repeats, and points arrows at where pages align, as chart software does. */
  overlapMarks?: boolean
}

export interface LegendPage {
  type: 'legend'
  entries: LegendEntry[]
}

/** A page that is neither chart nor legend, such as a cover or instructions. */
export interface TextPage {
  type: 'text'
  lines: string[]
}

/** A ruled table of text, such as the info page charting programs print. */
export interface TablePage {
  type: 'table'
  cell: { width: number; height: number }
  /** One array per row, one string per cell. */
  rows: string[][]
}

export interface LegendEntry {
  /** Symbol name, as used in chart grids. */
  symbol: string
  thread: Thread
  name: string
  strands: number
  /** The stitch count the legend prints. */
  count: number
}

export interface Thread {
  brand: string
  /** For example '310'. */
  code: string
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 36
const BLANK = '.'
// Text is set in a standard font, as chart software usually does for legends.
const TEXT_FONT = 'Helv'
const TEXT_SIZE = 10
const LINE_HEIGHT = 14
const LEGEND_ROW_HEIGHT = 16
const GRID_LINE_WIDTH = 0.5
// The grey that overlap shading is filled with.
const SHADE = 0.85
const MARGIN_NUMBER_EVERY = 10
const MARGIN_NUMBER_GAP = 4
// Helvetica's digits are all this wide, in thousandths of the font size.
const DIGIT_WIDTH = 556
const LEGEND_COLUMNS = { symbol: 0, brand: 24, code: 74, name: 114, strands: 284, count: 324 }

// What the ToUnicode map says each shape is.
const SHAPE_UNICODE: Record<Shape, string> = {
  square: '■',
  triangle: '▲',
}

type Point = [x: number, y: number]

const encoder = new TextEncoder()

function hex(code: number) {
  return `<${code.toString(16).padStart(2, '0').toUpperCase()}>`
}

class PdfWriter {
  private objects: Uint8Array[] = []

  /** Reserves an object number so other objects can refer to it first. */
  reserve() {
    this.objects.push(new Uint8Array())
    return this.objects.length
  }

  set(id: number, body: string) {
    this.objects[id - 1] = encoder.encode(body)
  }

  add(body: string) {
    const id = this.reserve()
    this.set(id, body)
    return id
  }

  addStream(dictionary: string, data: Uint8Array) {
    const id = this.reserve()
    this.objects[id - 1] = concat([
      encoder.encode(`<< ${dictionary} /Length ${data.length} >>\nstream\n`),
      data,
      encoder.encode('\nendstream'),
    ])
    return id
  }

  toBytes(root: number) {
    const parts = [encoder.encode('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')]
    let offset = parts[0].length
    const offsets: number[] = []
    this.objects.forEach((body, i) => {
      offsets.push(offset)
      const object = concat([encoder.encode(`${i + 1} 0 obj\n`), body, encoder.encode('\nendobj\n')])
      parts.push(object)
      offset += object.length
    })
    const xref = [
      'xref',
      `0 ${this.objects.length + 1}`,
      '0000000000 65535 f ',
      ...offsets.map((value) => `${String(value).padStart(10, '0')} 00000 n `),
      'trailer',
      `<< /Size ${this.objects.length + 1} /Root ${root} 0 R >>`,
      'startxref',
      String(offset),
      '%%EOF',
    ]
    parts.push(encoder.encode(xref.join('\n') + '\n'))
    return concat(parts)
  }
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function toUnicodeCMap(glyphs: Record<number, Shape>) {
  const entries = Object.entries(glyphs).map(
    ([code, shape]) =>
      `${hex(Number(code))} <${SHAPE_UNICODE[shape].charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()}>`,
  )
  return [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<00> <FF>',
    'endcodespacerange',
    `${entries.length} beginbfchar`,
    ...entries,
    'endbfchar',
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n')
}

function embedFont(pdf: PdfWriter, name: string, font: FontDescription) {
  const codes = Object.keys(font.glyphs).map(Number)
  const firstChar = Math.min(...codes)
  const lastChar = Math.max(...codes)
  const file = buildTrueTypeFont({ name, glyphs: font.glyphs })
  const fontFile = pdf.addStream(`/Length1 ${file.length}`, file)
  const descriptor = pdf.add(
    `<< /Type /FontDescriptor /FontName /${name} /Flags 4 /FontBBox [0 0 1000 1000] /ItalicAngle 0` +
      ` /Ascent 900 /Descent -100 /CapHeight 800 /StemV 80 /FontFile2 ${fontFile} 0 R >>`,
  )
  const widths = Array.from({ length: lastChar - firstChar + 1 }, () => 1000).join(' ')
  const toUnicode =
    font.toUnicode === false ? '' : ` /ToUnicode ${pdf.addStream('', encoder.encode(toUnicodeCMap(font.glyphs)))} 0 R`
  return pdf.add(
    `<< /Type /Font /Subtype /TrueType /BaseFont /${name} /FirstChar ${firstChar} /LastChar ${lastChar}` +
      ` /Widths [${widths}] /FontDescriptor ${descriptor} 0 R${toUnicode} >>`,
  )
}

function pdfString(value: string) {
  return `(${value.replace(/[\\()]/g, (char) => `\\${char}`)})`
}

function text(x: number, y: number, value: string) {
  return `BT /${TEXT_FONT} ${TEXT_SIZE} Tf 1 0 0 1 ${x} ${y} Tm ${pdfString(value)} Tj ET`
}

function symbolFor(name: string, symbols: Record<string, SymbolDescription>) {
  const symbol = symbols[name]
  if (!symbol) throw new Error(`Chart uses "${name}", which is not in symbols`)
  return symbol
}

function checkSymbolFonts(description: ChartPdfDescription) {
  for (const [name, symbol] of Object.entries(description.symbols)) {
    if (!(symbol.font in description.fonts)) {
      throw new Error(`Symbol "${name}" uses font "${symbol.font}", which is not in fonts`)
    }
  }
}

function textContent(page: TextPage) {
  return page.lines.map((line, i) => text(MARGIN, PAGE_HEIGHT - MARGIN - (i + 1) * LINE_HEIGHT, line)).join('\n')
}

function legendContent(page: LegendPage, symbols: Record<string, SymbolDescription>, fontKeys: Map<string, string>) {
  return page.entries
    .flatMap((entry, i) => {
      const y = PAGE_HEIGHT - MARGIN - (i + 1) * LEGEND_ROW_HEIGHT
      const symbol = symbolFor(entry.symbol, symbols)
      const column = (name: keyof typeof LEGEND_COLUMNS) => MARGIN + LEGEND_COLUMNS[name]
      return [
        `BT /${fontKeys.get(symbol.font)} ${TEXT_SIZE} Tf 1 0 0 1 ${column('symbol')} ${y} Tm ${hex(symbol.code)} Tj ET`,
        text(column('brand'), y, entry.thread.brand),
        text(column('code'), y, entry.thread.code),
        text(column('name'), y, entry.name),
        text(column('strands'), y, String(entry.strands)),
        text(column('count'), y, String(entry.count)),
      ]
    })
    .join('\n')
}

/** A solid grid of `rows` × `columns` cells from the top left margin. */
function gridLines(cell: { width: number; height: number }, rows: number, columns: number) {
  const top = PAGE_HEIGHT - MARGIN
  const right = MARGIN + columns * cell.width
  const bottom = top - rows * cell.height
  const ops = [`${GRID_LINE_WIDTH} w`]
  for (let row = 0; row <= rows; row++) {
    const y = top - row * cell.height
    ops.push(`${MARGIN} ${y} m ${right} ${y} l S`)
  }
  for (let column = 0; column <= columns; column++) {
    const x = MARGIN + column * cell.width
    ops.push(`${x} ${top} m ${x} ${bottom} l S`)
  }
  return ops
}

function tableContent(page: TablePage) {
  const { width, height } = page.cell
  const top = PAGE_HEIGHT - MARGIN
  const ops = gridLines(page.cell, page.rows.length, Math.max(...page.rows.map((row) => row.length)))
  page.rows.forEach((row, rowIndex) => {
    row.forEach((value, column) => {
      const baseline = top - (rowIndex + 1) * height + (height - TEXT_SIZE) / 2 + 2
      ops.push(text(MARGIN + column * width + 3, baseline, value))
    })
  })
  return ops.join('\n')
}

/** One printed page of a chart, and where its top left cell sits in the whole chart (0-based). */
interface ChartPart extends ChartPage {
  origin: { row: number; column: number }
  /** Where the next page across and down begins, counted from this page's first row and column. */
  next: { row?: number; column?: number }
}

/** The chart cut into the pages it prints on, row by row from the top left. */
function chartPages(page: ChartPage): ChartPart[] {
  const columns = Math.max(...page.grid.map((row) => row.length))
  const { width, height } = page.pageSize ?? {
    width: columns,
    height: page.grid.length,
  }
  const parts: ChartPart[] = []
  const rowStarts = pageStarts(page.grid.length, height, page.overlap)
  const columnStarts = pageStarts(columns, width, page.overlap)
  rowStarts.forEach((top, down) => {
    columnStarts.forEach((left, across) => {
      const grid = page.grid.slice(top, top + height).map((row) => row.slice(left, left + width))
      const next = {
        row: rowStarts[down + 1] === undefined ? undefined : rowStarts[down + 1] - top,
        column: columnStarts[across + 1] === undefined ? undefined : columnStarts[across + 1] - left,
      }
      parts.push({ ...page, grid, origin: { row: top, column: left }, next })
    })
  })
  return parts
}

/** Where each page starts along one side of the chart, repeating `overlap` stitches from the page before. */
function pageStarts(length: number, perPage: number, overlap = 0) {
  const starts = [0]
  while (starts.at(-1)! + perPage < length) starts.push(starts.at(-1)! + perPage - overlap)
  return starts
}

/** Shades the stitches this page repeats from the pages before it. Drawn first, under the grid and symbols. */
function overlapShading(part: ChartPart) {
  const { width, height } = part.cell
  const top = PAGE_HEIGHT - MARGIN
  const [columns, rows] = [Math.max(...part.grid.map((row) => row.length)), part.grid.length]
  const overlap = part.overlap ?? 0
  const ops: string[] = []
  if (part.origin.column > 0) ops.push(`${MARGIN} ${top - rows * height} ${overlap * width} ${rows * height} re f`)
  if (part.origin.row > 0) ops.push(`${MARGIN} ${top - overlap * height} ${columns * width} ${overlap * height} re f`)
  return ops.length ? [`${SHADE} g`, ...ops, '0 g'] : []
}

/**
 * Arrows outside the grid pointing at the lines neighbouring pages align on:
 * this page's first column and row when it repeats stitches, and where the next page begins.
 */
function alignmentArrows(part: ChartPart) {
  const { width, height } = part.cell
  const top = PAGE_HEIGHT - MARGIN
  const [columns, rows] = [Math.max(...part.grid.map((row) => row.length)), part.grid.length]
  const [right, bottom] = [MARGIN + columns * width, top - rows * height]
  const arrow = (tip: Point, base: [Point, Point]) => {
    const [a, b, c] = [base[0], base[1], tip].map(([x, y]) => `${x} ${y}`)
    return [`${a} m ${b} l ${c} l f`, `${a} m ${b} l ${c} l ${a} l S`]
  }
  const ops = [`${GRID_LINE_WIDTH} w`]
  const columnLines = [...(part.origin.column > 0 ? [0] : []), ...(part.next.column ? [part.next.column] : [])]
  for (const column of columnLines) {
    const x = MARGIN + column * width
    ops.push(...arrow([x, top], [[x - width / 2, top + height / 2], [x + width / 2, top + height / 2]]))
    ops.push(...arrow([x, bottom], [[x - width / 2, bottom - height / 2], [x + width / 2, bottom - height / 2]]))
  }
  const rowLines = [...(part.origin.row > 0 ? [0] : []), ...(part.next.row ? [part.next.row] : [])]
  for (const row of rowLines) {
    const y = top - row * height
    ops.push(...arrow([MARGIN, y], [[MARGIN - width / 2, y - height / 2], [MARGIN - width / 2, y + height / 2]]))
    ops.push(...arrow([right, y], [[right + width / 2, y - height / 2], [right + width / 2, y + height / 2]]))
  }
  return ops
}

/** Every 10th row and column number, centred on its column above the grid and on its row left of it. */
function marginNumbers(part: ChartPart) {
  const { width, height } = part.cell
  const top = PAGE_HEIGHT - MARGIN
  const textWidth = (value: string) => (value.length * DIGIT_WIDTH * TEXT_SIZE) / 1000
  const ops: string[] = []
  const columns = Math.max(...part.grid.map((row) => row.length))
  for (let column = 0; column < columns; column++) {
    const number = String(part.origin.column + column + 1)
    if (Number(number) % MARGIN_NUMBER_EVERY) continue
    const middle = MARGIN + (column + 0.5) * width
    ops.push(text(middle - textWidth(number) / 2, top + MARGIN_NUMBER_GAP, number))
  }
  part.grid.forEach((_row, row) => {
    const number = String(part.origin.row + row + 1)
    if (Number(number) % MARGIN_NUMBER_EVERY) return
    const baseline = top - (row + 1) * height + (height - TEXT_SIZE) / 2 + 2
    ops.push(text(MARGIN - MARGIN_NUMBER_GAP - textWidth(number), baseline, number))
  })
  return ops
}

function chartContent(page: ChartPart, symbols: Record<string, SymbolDescription>, fontKeys: Map<string, string>) {
  const { width, height } = page.cell
  const size = Math.min(width, height)
  const top = PAGE_HEIGHT - MARGIN
  const ops = [
    ...(page.overlapMarks ? overlapShading(page) : []),
    ...gridLines(page.cell, page.grid.length, Math.max(...page.grid.map((row) => row.length))),
  ]
  if (page.marginNumbers) ops.push(...marginNumbers(page))
  if (page.overlapMarks) ops.push(...alignmentArrows(page))
  page.grid.forEach((row, rowIndex) => {
    ;[...row].forEach((name, column) => {
      if (name === BLANK) return
      const symbol = symbolFor(name, symbols)
      const x = MARGIN + column * width + (width - size) / 2
      const y = top - (rowIndex + 1) * height + (height - size) / 2
      ops.push(`BT /${fontKeys.get(symbol.font)} ${size} Tf 1 0 0 1 ${x} ${y} Tm ${hex(symbol.code)} Tj ET`)
    })
  })
  return ops.join('\n')
}

export function buildChartPdf(description: ChartPdfDescription): Uint8Array {
  checkSymbolFonts(description)
  const pdf = new PdfWriter()
  const catalog = pdf.reserve()
  const pagesId = pdf.reserve()

  const fontKeys = new Map<string, string>()
  const fontRefs: string[] = []
  Object.entries(description.fonts).forEach(([name, font], i) => {
    const key = `F${i + 1}`
    fontKeys.set(name, key)
    fontRefs.push(`/${key} ${embedFont(pdf, name, font)} 0 R`)
  })
  fontRefs.push(`/${TEXT_FONT} ${pdf.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')} 0 R`)
  const resources = `<< /Font << ${fontRefs.join(' ')} >> >>`

  const contentsFor = (page: PageDescription) => {
    switch (page.type) {
      case 'chart':
        return chartPages(page).map((part) => chartContent(part, description.symbols, fontKeys))
      case 'legend':
        return [legendContent(page, description.symbols, fontKeys)]
      case 'text':
        return [textContent(page)]
      case 'table':
        return [tableContent(page)]
    }
  }

  const pageIds = description.pages.flatMap(contentsFor).map((content) => {
    const stream = pdf.addStream('', encoder.encode(content))
    return pdf.add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]` +
        ` /Resources ${resources} /Contents ${stream} 0 R >>`,
    )
  })

  pdf.set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`)
  pdf.set(catalog, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`)
  return pdf.toBytes(catalog)
}
