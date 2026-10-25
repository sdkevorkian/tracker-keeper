// Builds synthetic chart PDFs for tests from a short description, so no
// fixture is ever derived from a real chart. Fonts are generated, not committed.
import { buildTrueTypeFont, type Shape } from './trueTypeFont.ts'

export interface ChartPdfDescription {
  /** Embedded symbol fonts, by the name written to the PDF. */
  fonts: Record<string, FontDescription>
  /** One-character keys used in chart grids and legend rows. */
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

export type PageDescription = ChartPage | LegendPage | TextPage

export interface ChartPage {
  type: 'chart'
  /** Cell size in points. Cells need not be square. */
  cell: { width: number; height: number }
  /** One string per row, one symbol key per cell, '.' for a blank cell. */
  grid: string[]
}

export interface LegendPage {
  type: 'legend'
  rows: LegendRow[]
}

/** A page that is neither chart nor legend, such as a cover or instructions. */
export interface TextPage {
  type: 'text'
  lines: string[]
}

export interface LegendRow {
  /** Symbol key, as used in chart grids. */
  symbol: string
  brand: string
  /** Thread code, for example '310'. */
  code: string
  name: string
  strands: number
  /** The stitch count the legend prints. */
  count: number
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
const LEGEND_COLUMNS = { symbol: 0, brand: 24, code: 74, name: 114, strands: 284, count: 324 }

// What the ToUnicode map says each shape is.
const SHAPE_UNICODE: Record<Shape, string> = {
  square: '■',
  triangle: '▲',
}

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

function symbolFor(key: string, symbols: Record<string, SymbolDescription>) {
  const symbol = symbols[key]
  if (!symbol) throw new Error(`Chart uses "${key}", which is not in symbols`)
  return symbol
}

function textContent(page: TextPage) {
  return page.lines.map((line, i) => text(MARGIN, PAGE_HEIGHT - MARGIN - (i + 1) * LINE_HEIGHT, line)).join('\n')
}

function legendContent(page: LegendPage, symbols: Record<string, SymbolDescription>, fontKeys: Map<string, string>) {
  return page.rows
    .flatMap((row, i) => {
      const y = PAGE_HEIGHT - MARGIN - (i + 1) * LEGEND_ROW_HEIGHT
      const symbol = symbolFor(row.symbol, symbols)
      const column = (name: keyof typeof LEGEND_COLUMNS) => MARGIN + LEGEND_COLUMNS[name]
      return [
        `BT /${fontKeys.get(symbol.font)} ${TEXT_SIZE} Tf 1 0 0 1 ${column('symbol')} ${y} Tm ${hex(symbol.code)} Tj ET`,
        text(column('brand'), y, row.brand),
        text(column('code'), y, row.code),
        text(column('name'), y, row.name),
        text(column('strands'), y, String(row.strands)),
        text(column('count'), y, String(row.count)),
      ]
    })
    .join('\n')
}

function chartContent(page: ChartPage, symbols: Record<string, SymbolDescription>, fontKeys: Map<string, string>) {
  const { width, height } = page.cell
  const size = Math.min(width, height)
  const top = PAGE_HEIGHT - MARGIN
  const ops: string[] = []
  page.grid.forEach((row, rowIndex) => {
    ;[...row].forEach((key, column) => {
      if (key === BLANK) return
      const symbol = symbolFor(key, symbols)
      const x = MARGIN + column * width + (width - size) / 2
      const y = top - (rowIndex + 1) * height + (height - size) / 2
      ops.push(`BT /${fontKeys.get(symbol.font)} ${size} Tf 1 0 0 1 ${x} ${y} Tm ${hex(symbol.code)} Tj ET`)
    })
  })
  return ops.join('\n')
}

export function buildChartPdf(description: ChartPdfDescription): Uint8Array {
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

  const contentFor = (page: PageDescription) => {
    switch (page.type) {
      case 'chart':
        return chartContent(page, description.symbols, fontKeys)
      case 'legend':
        return legendContent(page, description.symbols, fontKeys)
      case 'text':
        return textContent(page)
    }
  }

  const pageIds = description.pages.map((page) => {
    const content = pdf.addStream('', encoder.encode(contentFor(page)))
    return pdf.add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]` +
        ` /Resources ${resources} /Contents ${content} 0 R >>`,
    )
  })

  pdf.set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`)
  pdf.set(catalog, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`)
  return pdf.toBytes(catalog)
}
