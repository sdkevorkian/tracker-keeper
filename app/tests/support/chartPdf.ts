// Builds synthetic chart PDFs for tests from a short description, so no
// fixture is ever derived from a real chart. Fonts are generated, not committed.
import { buildTrueTypeFont, type Shape } from './trueTypeFont.ts'

export interface ChartPdfDescription {
  /** The title in the PDF's metadata. None by default. */
  title?: string
  /** Embedded symbol fonts, by the name written to the PDF. */
  fonts: Record<string, FontDescription>
  /** The chart's symbols, by the one-character name chart grids and legend entries use. */
  symbols: Record<string, SymbolDescription>
  pages: PageDescription[]
  /**
   * Stores every page turned this far counterclockwise and sets /Rotate, so a viewer turns it
   * clockwise back upright, as some PDF software does. Upright by default.
   */
  rotate?: Rotation
}

export type Rotation = 90 | 180 | 270

export interface FontDescription {
  /** Character code (0–255) to the shape drawn for it. */
  glyphs: Record<number, Shape>
  /** Set to false to leave out the ToUnicode map, as some chart PDFs do. */
  toUnicode?: boolean
  /** What the ToUnicode map says each character code is, where it isn't its shape. */
  unicode?: Record<number, string>
  /** Each glyph's advance, in thousandths of the font size. 1000 by default. */
  advance?: number
}

export interface SymbolDescription {
  font: string
  code: number
}

export type PageDescription = ChartPage | LegendPage | TextPage | TablePage

/** How a chart page prints each cell. */
export type PdfStyle = 'symbols' | 'symbols on color' | 'color blocks'

export interface ChartPage {
  type: 'chart'
  /** Symbols on white by default. Any style with color needs `colors`. */
  style?: PdfStyle
  /** Each symbol's fill color, as `#RRGGBB`, for styles that print color. */
  colors?: Record<string, string>
  /** Outlines each colored cell, on top of the grid lines, as some chart software does. */
  outlineCells?: boolean
  /** Prints this character in each blank cell, such as a space from the symbol font, as some chart software does. Nothing by default. */
  blankCells?: SymbolDescription
  /** How the grid lines are drawn. Solid by default. */
  gridLines?: GridLines
  /** Draws every 10th row and column line of the whole chart thicker, as chart software does. Not by default. */
  thickLines?: ThickLines
  /** Prints the designer's logo below the grid: a frame as wide as the grid, holding a drawn mark and a name. */
  logo?: boolean
  /** Cell size in points. Cells need not be square. */
  cell: { width: number; height: number }
  /** One string per row, one symbol name per cell, '.' for a blank cell. */
  grid: string[]
  /** Stitches per page. A larger grid is split over several pages, row by row. */
  pageSize?: { width: number; height: number }
  /** How many rows and columns neighbouring pages repeat. None by default. */
  overlap?: number
  /**
   * Prints every 10th row and column number of the whole chart in the margins, as chart software does.
   * 'padded' pads shorter numbers with leading spaces to three characters so they line up, as some chart software does.
   */
  marginNumbers?: boolean | 'padded'
  /** Prints the row margin numbers turned a quarter turn counterclockwise, reading upward, as some chart software does. */
  sidewaysRowNumbers?: boolean
  /** Draws a backstitch straight along the middle of the first row and of the first column, through the cells. None by default. */
  backstitches?: boolean
  /** Shades the rows and columns a page repeats, and points arrows at where pages align, as chart software does. */
  overlapMarks?: boolean
}

/** What a legend prints in one column of an entry. */
export type LegendColumn =
  | 'row number'
  | 'symbol'
  | 'swatch'
  | 'brand'
  | 'code'
  | 'name'
  /** The code and name together, as in '745 - BANANA YELLOW'. */
  | 'code - name'
  | 'strands'
  | 'skeins'
  | 'count'

export interface LegendPage {
  type: 'legend'
  /** What each entry prints, left to right. Symbol, swatch, brand, code, name, strands and count by default. */
  columns?: LegendColumn[]
  /** Lines of text above the headings and entries, such as 'Floss: DMC'. None by default. */
  notes?: string[]
  /** How many entries share a line, side by side. One by default. */
  entriesPerLine?: number
  /** Prints the symbols in this font, at the same codes, such as a bold variant of the chart's. The chart's font by default. */
  symbolFont?: string
  /**
   * How words in the legend's text are spaced: with space characters, or by
   * moving the text along between words, as some PDF software does. Spaces by default.
   */
  wordSpacing?: 'spaces' | 'moved'
  /** Prints each symbol between blank glyphs: code 0 before, and code 0 then a space after, as some chart software does. */
  paddedSymbols?: boolean
  /** Heading lines above the entries, one string per column, in any script. */
  headings?: Partial<Record<LegendColumn, string>>[]
  /** Ruled boxes the legend draws, as some chart software does. None by default. */
  boxes?: LegendBoxes
  entries: LegendEntry[]
}

/**
 * Ruled boxes a legend draws, one per entry, edge to edge down the column:
 * around each swatch, with a frame around them all, or around each symbol.
 */
export type LegendBoxes = 'framed swatches' | 'boxed symbols'

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

export type LegendEntry = {
  /** Symbol name, as used in chart grids. */
  symbol: string
  /** The stitch count the legend prints. */
  count: number
  /** A square of this color, as `#RRGGBB`, printed between the symbol and the thread. None by default. */
  swatch?: string
} & (
  | LegendThread
  /** A blend: several threads in one row, joined by +. */
  | { threads: LegendThread[] }
)

export interface LegendThread {
  thread: Thread
  name: string
  strands: number
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
const THICK_LINE_WIDTH = 1
const CELL_OUTLINE_WIDTH = 0.25
// The grey that overlap shading is filled with.
const SHADE = 0.85
const MARGIN_NUMBER_EVERY = 10
const MARGIN_NUMBER_GAP = 4
// Padded margin numbers are this many characters long.
const PADDED_NUMBER_LENGTH = 3
const BACKSTITCH_WIDTH = 1
// Helvetica's digits are all this wide, in thousandths of the font size.
const DIGIT_WIDTH = 556
/** How wide each legend column is, in points. */
const LEGEND_COLUMN_WIDTHS: Record<LegendColumn, number> = {
  'row number': 24,
  symbol: 16,
  swatch: 28,
  brand: 50,
  code: 80,
  name: 170,
  'code - name': 170,
  strands: 50,
  skeins: 60,
  count: 50,
}
const DEFAULT_LEGEND_COLUMNS: LegendColumn[] = ['symbol', 'swatch', 'brand', 'code', 'name', 'strands', 'count']
// The space between entries that share a line.
const LEGEND_ENTRY_GAP = 20
// How many skeins a stitch count takes, roughly, as legends print it.
const STITCHES_PER_SKEIN = 2000
// The columns a heading line's strings head, in order.
// Headings can be in any script, so they are set in a generated font that maps each code to its character.
const HEADING_FONT = 'LegendText'
const HEADING_ADVANCE = 500
const SWATCH_SIZE = 8
// A legend box runs this far below its row's baseline, and is a row tall.
const LEGEND_BOX_DESCENT = 4
// How far a frame around legend boxes sits outside them.
const LEGEND_FRAME_PADDING = 2
const FIRST_HEADING_CODE = 0x21

// What the ToUnicode map says each shape is.
const SHAPE_UNICODE: Record<Shape, string> = {
  square: '■',
  triangle: '▲',
  blank: ' ',
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

  toBytes(root: number, info?: number) {
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
      `<< /Size ${this.objects.length + 1} /Root ${root} 0 R${info ? ` /Info ${info} 0 R` : ''} >>`,
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

function toUnicodeCMap(font: FontDescription) {
  const entries = Object.entries(font.glyphs).map(([code, shape]) => {
    const unicode = font.unicode?.[Number(code)] ?? SHAPE_UNICODE[shape]
    return `${hex(Number(code))} <${unicode.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()}>`
  })
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
  const widths = Array.from({ length: lastChar - firstChar + 1 }, () => font.advance ?? 1000).join(' ')
  const toUnicode =
    font.toUnicode === false ? '' : ` /ToUnicode ${pdf.addStream('', encoder.encode(toUnicodeCMap(font)))} 0 R`
  return pdf.add(
    `<< /Type /Font /Subtype /TrueType /BaseFont /${name} /FirstChar ${firstChar} /LastChar ${lastChar}` +
      ` /Widths [${widths}] /FontDescriptor ${descriptor} 0 R${toUnicode} >>`,
  )
}

/** A PDF text string in UTF-16, so it can hold any script. */
function pdfTextString(value: string) {
  const units = Array.from({ length: value.length }, (_, i) => value.charCodeAt(i).toString(16).padStart(4, '0'))
  return `<FEFF${units.join('').toUpperCase()}>`
}

function pdfString(value: string) {
  return `(${value.replace(/[\\()]/g, (char) => `\\${char}`)})`
}

function text(x: number, y: number, value: string) {
  return `BT /${TEXT_FONT} ${TEXT_SIZE} Tf 1 0 0 1 ${x} ${y} Tm ${pdfString(value)} Tj ET`
}

// How far text moves between words spaced without a space character: a space's width in Helvetica, in thousandths of the font size.
const MOVED_WORD_GAP = 278

/** Text whose words are spaced by moving along between them, with no space characters. */
function movedText(x: number, y: number, value: string) {
  const words = value.split(' ').map(pdfString)
  return `BT /${TEXT_FONT} ${TEXT_SIZE} Tf 1 0 0 1 ${x} ${y} Tm [${words.join(` -${MOVED_WORD_GAP} `)}] TJ ET`
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

function joined<T>(items: T[], format: (item: T) => string, separator: string) {
  return items.map(format).join(separator)
}

/** A character code for every character the PDF's legend headings use, in the heading font. */
function headingCodes(pages: PageDescription[]) {
  const characters = new Set(
    pages.flatMap((page) =>
      page.type === 'legend'
        ? (page.headings ?? []).flatMap((line) => Object.values(line).flatMap((value) => [...value]))
        : [],
    ),
  )
  if (characters.size > 0xff - FIRST_HEADING_CODE) throw new Error('Legend headings use too many characters')
  return new Map([...characters].map((character, i) => [character, FIRST_HEADING_CODE + i]))
}

/** Where each column starts, from the left margin, for a legend that prints these columns. */
function legendColumnStarts(columns: LegendColumn[]) {
  const starts = new Map<LegendColumn, number>()
  let x = 0
  for (const column of columns) {
    starts.set(column, x)
    x += LEGEND_COLUMN_WIDTHS[column]
  }
  return starts
}

/** What one entry prints in one column, as content-stream operators. */
function legendCell(
  entry: LegendEntry,
  column: LegendColumn,
  columns: LegendColumn[],
  at: { x: number; y: number; row: number },
  symbolOps: (x: number, y: number) => string,
  write: typeof text,
) {
  const threads = 'threads' in entry ? entry.threads : [entry]
  const { x, y } = at
  const print = (value: string) => [write(x, y, value)]
  switch (column) {
    case 'row number':
      return print(String(at.row))
    case 'symbol':
      return [symbolOps(x, y)]
    case 'swatch':
      return entry.swatch ? [`${fillColor(entry.swatch)} ${x} ${y} ${SWATCH_SIZE} ${SWATCH_SIZE} re f 0 g`] : []
    case 'brand':
      // With a code column too, a blend prints each thread whole here and leaves the code column empty.
      if (threads.length > 1 && columns.includes('code')) {
        return print(joined(threads, ({ thread }) => `${thread.brand} ${thread.code}`, ' + '))
      }
      return print(joined(threads, ({ thread }) => thread.brand, ' + '))
    case 'code':
      if (threads.length > 1 && columns.includes('brand')) return []
      return print(joined(threads, ({ thread }) => thread.code, ' + '))
    case 'name':
      return print(joined(threads, ({ name }) => name, ' + '))
    case 'code - name':
      return print(joined(threads, ({ thread, name }) => `${thread.code} - ${name}`, ' + '))
    case 'strands':
      return print(joined(threads, ({ strands }) => String(strands), '+'))
    case 'skeins':
      return print(`${(entry.count / STITCHES_PER_SKEIN).toFixed(1)} Skeins`)
    case 'count':
      return print(String(entry.count))
  }
}

function legendContent(
  page: LegendPage,
  symbols: Record<string, SymbolDescription>,
  fontKeys: Map<string, string>,
  headingCodeOf: Map<string, number>,
) {
  const columns = page.columns ?? DEFAULT_LEGEND_COLUMNS
  const starts = legendColumnStarts(columns)
  const column = (name: LegendColumn) => MARGIN + (starts.get(name) ?? 0)
  const rowY = (row: number) => PAGE_HEIGHT - MARGIN - (row + 1) * LEGEND_ROW_HEIGHT
  const notes = page.notes ?? []
  const noteOps = notes.map((note, row) => text(MARGIN, rowY(row), note))
  const write = page.wordSpacing === 'moved' ? movedText : text
  const perLine = page.entriesPerLine ?? 1
  const entryWidth = columns.reduce((sum, name) => sum + LEGEND_COLUMN_WIDTHS[name], 0) + LEGEND_ENTRY_GAP
  // Headings repeat over each entry that shares a line.
  const slots = Array.from({ length: Math.min(perLine, page.entries.length) }, (_, slot) => slot * entryWidth)
  const headings = page.headings ?? []
  const headingOps = headings.flatMap((line, i) =>
    slots.flatMap((left) =>
      Object.entries(line).map(([name, value]) => {
        const codes = [...value]
          .map((character) => headingCodeOf.get(character)!.toString(16).padStart(2, '0'))
          .join('')
        const x = left + column(name as LegendColumn)
        return `BT /${fontKeys.get(HEADING_FONT)} ${TEXT_SIZE} Tf 1 0 0 1 ${x} ${rowY(notes.length + i)} Tm <${codes}> Tj ET`
      }),
    ),
  )
  const entryOps = page.entries.flatMap((entry, i) => {
    const y = rowY(notes.length + headings.length + Math.floor(i / perLine))
    const left = (i % perLine) * entryWidth
    const symbol = symbolFor(entry.symbol, symbols)
    const font = page.symbolFont ?? symbol.font
    const code = symbol.code.toString(16).padStart(2, '0')
    const codes = page.paddedSymbols ? `<00${code}0020>` : `<${code}>`
    const symbolOps = (x: number, at: number) =>
      `BT /${fontKeys.get(font)} ${TEXT_SIZE} Tf 1 0 0 1 ${x} ${at} Tm ${codes} Tj ET`
    // A swatch in a box sits in the middle of it.
    const inset = (name: LegendColumn) =>
      name === 'swatch' && page.boxes === 'framed swatches' ? (LEGEND_COLUMN_WIDTHS.swatch - SWATCH_SIZE) / 2 : 0
    return columns.flatMap((name) =>
      legendCell(entry, name, columns, { x: left + column(name) + inset(name), y, row: i + 1 }, symbolOps, write),
    )
  })
  const boxOps = page.boxes
    ? legendBoxes(
        page,
        columns,
        (i) => ({
          left: (i % perLine) * entryWidth,
          y: rowY(notes.length + headings.length + Math.floor(i / perLine)),
        }),
        column,
      )
    : []
  return [...noteOps, ...headingOps, ...entryOps, ...boxOps].join('\n')
}

/** A rectangle's outline, drawn as four straight lines. */
function outline(x0: number, y0: number, x1: number, y1: number) {
  return `${GRID_LINE_WIDTH} w ${x0} ${y0} m ${x1} ${y0} l ${x1} ${y1} l ${x0} ${y1} l ${x0} ${y0} l S`
}

/** A box around each entry's swatch or symbol, and a frame around each column of swatch boxes. */
function legendBoxes(
  page: LegendPage,
  columns: LegendColumn[],
  place: (entry: number) => { left: number; y: number },
  column: (name: LegendColumn) => number,
) {
  const boxed: LegendColumn = page.boxes === 'framed swatches' ? 'swatch' : 'symbol'
  if (!columns.includes(boxed)) throw new Error(`Legend boxes need a ${boxed} column`)
  const width = LEGEND_COLUMN_WIDTHS[boxed]
  const boxes = page.entries.map((_, i) => {
    const { left, y } = place(i)
    const [x0, y0] = [left + column(boxed), y - LEGEND_BOX_DESCENT]
    return { x0, y0, x1: x0 + width, y1: y0 + LEGEND_ROW_HEIGHT }
  })
  const ops = boxes.map(({ x0, y0, x1, y1 }) => outline(x0, y0, x1, y1))
  if (page.boxes === 'framed swatches') {
    // One frame around each column of boxes, as entries side by side make several.
    for (const x0 of new Set(boxes.map((box) => box.x0))) {
      const inColumn = boxes.filter((box) => box.x0 === x0)
      const pad = LEGEND_FRAME_PADDING
      ops.push(
        outline(
          x0 - pad,
          Math.min(...inColumn.map((box) => box.y0)) - pad,
          x0 + width + pad,
          Math.max(...inColumn.map((box) => box.y1)) + pad,
        ),
      )
    }
  }
  return ops
}

/** How a chart page draws its grid lines. */
export type GridLines = 'solid' | 'dotted' | 'rectangles'

// A dotted line has a dot this long, in points, every point along it.
const DOT_LENGTH = 0.25

/** One line from `from` to `to`, `width` thick: a stroke, dots along it, or a thin filled rectangle. */
function lineOps(from: Point, to: Point, style: GridLines, width: number) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  if (style === 'rectangles') {
    const [x0, y0] = [Math.min(from[0], to[0]), Math.min(from[1], to[1])]
    return from[1] === to[1]
      ? `${x0} ${y0 - width / 2} ${length} ${width} re f`
      : `${x0 - width / 2} ${y0} ${width} ${length} re f`
  }
  if (style === 'solid') return `${width} w ${from[0]} ${from[1]} m ${to[0]} ${to[1]} l S`
  const at = (distance: number) => from.map((value, i) => value + ((to[i] - value) * distance) / length).join(' ')
  const dots = Array.from({ length: Math.floor(length) }, (_, i) => {
    const start = i + (1 - DOT_LENGTH) / 2
    return `${at(start)} m ${at(start + DOT_LENGTH)} l`
  })
  return `${width} w ${dots.join(' ')} S`
}

/** How a chart page thickens every 10th line: one wider stroke, or the line drawn twice, half a point apart. */
export type ThickLines = 'wide' | 'doubled'

// How far apart a doubled line's two strokes are, in points.
const DOUBLED_LINE_GAP = 0.5

interface GridOptions {
  style?: GridLines
  /** Thickens every 10th line of the whole chart, counting from this page's top left cell. */
  thick?: { from: { row: number; column: number }; as: ThickLines }
}

/** A grid of `rows` × `columns` cells from the top left margin. A dotted grid keeps a solid border. */
function gridLines(
  cell: { width: number; height: number },
  rows: number,
  columns: number,
  { style = 'solid', thick }: GridOptions = {},
) {
  const top = PAGE_HEIGHT - MARGIN
  const right = MARGIN + columns * cell.width
  const bottom = top - rows * cell.height
  const styleOf = (inner: boolean) => (style === 'dotted' && !inner ? 'solid' : style)
  const isThick = (line: number | undefined) => line !== undefined && line % MARGIN_NUMBER_EVERY === 0
  const ops: string[] = []
  /** A line, thickened when it is every 10th; `shift` moves a point down or right by `by` points. */
  const draw = (
    from: Point,
    to: Point,
    inner: boolean,
    thickened: boolean,
    shift: (point: Point, by: number) => Point,
  ) => {
    const lineStyle = styleOf(inner)
    if (!thickened || !thick) return ops.push(lineOps(from, to, lineStyle, GRID_LINE_WIDTH))
    if (thick.as === 'wide') return ops.push(lineOps(from, to, lineStyle, THICK_LINE_WIDTH))
    ops.push(lineOps(from, to, lineStyle, GRID_LINE_WIDTH))
    ops.push(lineOps(shift(from, DOUBLED_LINE_GAP), shift(to, DOUBLED_LINE_GAP), lineStyle, GRID_LINE_WIDTH))
  }
  for (let row = 0; row <= rows; row++) {
    const y = top - row * cell.height
    draw([MARGIN, y], [right, y], row > 0 && row < rows, isThick(thick && thick.from.row + row), ([x, at], by) => [
      x,
      at - by,
    ])
  }
  for (let column = 0; column <= columns; column++) {
    const x = MARGIN + column * cell.width
    draw(
      [x, top],
      [x, bottom],
      column > 0 && column < columns,
      isThick(thick && thick.from.column + column),
      ([at, y], by) => [at + by, y],
    )
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
    ops.push(
      ...arrow(
        [x, top],
        [
          [x - width / 2, top + height / 2],
          [x + width / 2, top + height / 2],
        ],
      ),
    )
    ops.push(
      ...arrow(
        [x, bottom],
        [
          [x - width / 2, bottom - height / 2],
          [x + width / 2, bottom - height / 2],
        ],
      ),
    )
  }
  const rowLines = [...(part.origin.row > 0 ? [0] : []), ...(part.next.row ? [part.next.row] : [])]
  for (const row of rowLines) {
    const y = top - row * height
    ops.push(
      ...arrow(
        [MARGIN, y],
        [
          [MARGIN - width / 2, y - height / 2],
          [MARGIN - width / 2, y + height / 2],
        ],
      ),
    )
    ops.push(
      ...arrow(
        [right, y],
        [
          [right + width / 2, y - height / 2],
          [right + width / 2, y + height / 2],
        ],
      ),
    )
  }
  return ops
}

/** Every 10th row and column number, centred on its column above the grid and on its row left of it. */
function marginNumbers(part: ChartPart) {
  const { width, height } = part.cell
  const top = PAGE_HEIGHT - MARGIN
  const textWidth = (value: string) => (value.length * DIGIT_WIDTH * TEXT_SIZE) / 1000
  const label = (value: number) =>
    part.marginNumbers === 'padded' ? String(value).padStart(PADDED_NUMBER_LENGTH, ' ') : String(value)
  const ops: string[] = []
  const columns = Math.max(...part.grid.map((row) => row.length))
  for (let column = 0; column < columns; column++) {
    const number = label(part.origin.column + column + 1)
    if (Number(number) % MARGIN_NUMBER_EVERY) continue
    const middle = MARGIN + (column + 0.5) * width
    ops.push(text(middle - textWidth(number) / 2, top + MARGIN_NUMBER_GAP, number))
  }
  part.grid.forEach((_row, row) => {
    const number = label(part.origin.row + row + 1)
    if (Number(number) % MARGIN_NUMBER_EVERY) return
    if (part.sidewaysRowNumbers) {
      // Turned so the text runs upward, its glyphs' tops pointing left: the baseline is the number's right edge.
      const start = top - (row + 0.5) * height - textWidth(number) / 2
      ops.push(
        `BT /${TEXT_FONT} ${TEXT_SIZE} Tf 0 1 -1 0 ${MARGIN - MARGIN_NUMBER_GAP} ${start} Tm ${pdfString(number)} Tj ET`,
      )
      return
    }
    const baseline = top - (row + 1) * height + (height - TEXT_SIZE) / 2 + 2
    ops.push(text(MARGIN - MARGIN_NUMBER_GAP - textWidth(number), baseline, number))
  })
  return ops
}

/** A backstitch along the middle of the first row and of the first column, from one side of the grid to the other. */
function backstitches(part: ChartPart) {
  const { width, height } = part.cell
  const top = PAGE_HEIGHT - MARGIN
  const [right, bottom] = [
    MARGIN + Math.max(...part.grid.map((row) => row.length)) * width,
    top - part.grid.length * height,
  ]
  const [x, y] = [MARGIN + width / 2, top - height / 2]
  return [`${BACKSTITCH_WIDTH} w ${MARGIN} ${y} m ${right} ${y} l S`, `${x} ${top} m ${x} ${bottom} l S`]
}

// A logo's frame sits this far below the grid and is this tall, in points.
const LOGO_GAP = 15
const LOGO_HEIGHT = 25
const LOGO_MARK_SIZE = 10
const LOGO_NAME = 'Test Studio'

/** A designer's logo below the grid: a frame as wide as the grid, holding a diamond mark and a name. */
function logo(part: ChartPart) {
  const width = Math.max(...part.grid.map((row) => row.length)) * part.cell.width
  const top = PAGE_HEIGHT - MARGIN - part.grid.length * part.cell.height - LOGO_GAP
  const [left, right, bottom] = [MARGIN, MARGIN + width, top - LOGO_HEIGHT]
  const middle = (top + bottom) / 2
  const half = LOGO_MARK_SIZE / 2
  const mark = [
    [left + 4, middle],
    [left + 4 + half, middle + half],
    [left + 4 + LOGO_MARK_SIZE, middle],
    [left + 4 + half, middle - half],
  ].map(([x, y]) => `${x} ${y}`)
  return [
    `${GRID_LINE_WIDTH} w ${left} ${top} m ${right} ${top} l ${right} ${bottom} l ${left} ${bottom} l ${left} ${top} l S`,
    `${mark[0]} m ${mark[1]} l ${mark[2]} l ${mark[3]} l h f`,
    text(left + 8 + LOGO_MARK_SIZE, middle - TEXT_SIZE / 2 + 2, LOGO_NAME),
  ]
}

/** The fill operator for a `#RRGGBB` color. */
function fillColor(color: string) {
  const channels = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
  return `${channels.map((channel) => channel.toFixed(3)).join(' ')} rg`
}

/** Fills each stitched cell with its symbol's color, under the grid and symbols. */
function cellColors(part: ChartPart) {
  const { width, height } = part.cell
  const top = PAGE_HEIGHT - MARGIN
  const ops: string[] = []
  part.grid.forEach((row, rowIndex) => {
    ;[...row].forEach((name, column) => {
      if (name === BLANK) return
      const color = part.colors?.[name]
      if (!color) throw new Error(`Chart prints "${name}" in color, but colors has none for it`)
      const box = `${MARGIN + column * width} ${top - (rowIndex + 1) * height} ${width} ${height}`
      ops.push(`${fillColor(color)} ${box} re f`)
      if (part.outlineCells) ops.push(`${CELL_OUTLINE_WIDTH} w ${box} re S`)
    })
  })
  return ops.length ? [...ops, '0 g'] : []
}

function chartContent(page: ChartPart, symbols: Record<string, SymbolDescription>, fontKeys: Map<string, string>) {
  const { width, height } = page.cell
  const size = Math.min(width, height)
  const top = PAGE_HEIGHT - MARGIN
  const style = page.style ?? 'symbols'
  const ops = [
    ...(style === 'symbols' ? [] : cellColors(page)),
    ...(page.overlapMarks ? overlapShading(page) : []),
    ...gridLines(page.cell, page.grid.length, Math.max(...page.grid.map((row) => row.length)), {
      style: page.gridLines,
      thick: page.thickLines && { from: page.origin, as: page.thickLines },
    }),
  ]
  if (page.backstitches) ops.push(...backstitches(page))
  if (page.marginNumbers) ops.push(...marginNumbers(page))
  if (page.overlapMarks) ops.push(...alignmentArrows(page))
  if (page.logo) ops.push(...logo(page))
  if (style === 'color blocks') return ops.join('\n')
  page.grid.forEach((row, rowIndex) => {
    ;[...row].forEach((name, column) => {
      if (name === BLANK && !page.blankCells) return
      const symbol = name === BLANK ? page.blankCells! : symbolFor(name, symbols)
      const x = MARGIN + column * width + (width - size) / 2
      const y = top - (rowIndex + 1) * height + (height - size) / 2
      ops.push(`BT /${fontKeys.get(symbol.font)} ${size} Tf 1 0 0 1 ${x} ${y} Tm ${hex(symbol.code)} Tj ET`)
    })
  })
  return ops.join('\n')
}

/**
 * The stored page's size and the transform that draws upright content sideways on it,
 * so that a viewer turning the page `rotate` degrees clockwise shows it upright.
 */
function storedPage(rotate?: Rotation) {
  switch (rotate) {
    case undefined:
      return { width: PAGE_WIDTH, height: PAGE_HEIGHT, transform: undefined }
    case 90:
      return { width: PAGE_HEIGHT, height: PAGE_WIDTH, transform: `0 1 -1 0 ${PAGE_HEIGHT} 0` }
    case 180:
      return { width: PAGE_WIDTH, height: PAGE_HEIGHT, transform: `-1 0 0 -1 ${PAGE_WIDTH} ${PAGE_HEIGHT}` }
    case 270:
      return { width: PAGE_HEIGHT, height: PAGE_WIDTH, transform: `0 -1 1 0 0 ${PAGE_WIDTH}` }
  }
}

export function buildChartPdf(description: ChartPdfDescription): Uint8Array {
  checkSymbolFonts(description)
  const pdf = new PdfWriter()
  const catalog = pdf.reserve()
  const pagesId = pdf.reserve()

  const headings = headingCodes(description.pages)
  const fonts: Record<string, FontDescription> = { ...description.fonts }
  if (headings.size) {
    fonts[HEADING_FONT] = {
      glyphs: Object.fromEntries([...headings.values()].map((code) => [code, 'square'])),
      unicode: Object.fromEntries([...headings].map(([character, code]) => [code, character])),
      advance: HEADING_ADVANCE,
    }
  }
  const fontKeys = new Map<string, string>()
  const fontRefs: string[] = []
  Object.entries(fonts).forEach(([name, font], i) => {
    const key = `F${i + 1}`
    fontKeys.set(name, key)
    fontRefs.push(`/${key} ${embedFont(pdf, name, font)} 0 R`)
  })
  fontRefs.push(
    `/${TEXT_FONT} ${pdf.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')} 0 R`,
  )
  const resources = `<< /Font << ${fontRefs.join(' ')} >> >>`

  const contentsFor = (page: PageDescription) => {
    switch (page.type) {
      case 'chart':
        return chartPages(page).map((part) => chartContent(part, description.symbols, fontKeys))
      case 'legend':
        return [legendContent(page, description.symbols, fontKeys, headings)]
      case 'text':
        return [textContent(page)]
      case 'table':
        return [tableContent(page)]
    }
  }

  const stored = storedPage(description.rotate)
  const pageIds = description.pages.flatMap(contentsFor).map((content) => {
    const turned = stored.transform
      ? `q ${stored.transform} cm
${content}
Q`
      : content
    const stream = pdf.addStream('', encoder.encode(turned))
    const rotate = description.rotate ? ` /Rotate ${description.rotate}` : ''
    return pdf.add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${stored.width} ${stored.height}]${rotate}` +
        ` /Resources ${resources} /Contents ${stream} 0 R >>`,
    )
  })

  pdf.set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`)
  pdf.set(catalog, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`)
  const info = description.title === undefined ? undefined : pdf.add(`<< /Title ${pdfTextString(description.title)} >>`)
  return pdf.toBytes(catalog, info)
}
