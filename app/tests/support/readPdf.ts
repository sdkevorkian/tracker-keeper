// Reads a PDF the way the import will: with pdf.js, reporting each glyph's
// font name, character code and position, plus the page's text.
import { fileURLToPath } from 'node:url'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

// pdf.js path data: each operation code is followed by its points.
const MOVE_TO = 0
const LINE_TO = 1
/** How many numbers follow each path operation code. */
const PATH_ARGUMENTS = [2, 2, 6, 4, 0]

export interface PdfGlyph {
  font: string
  code: number
  unicode: string
  /** Drawn from the font embedded in the PDF, not a substitute. */
  embedded: boolean
  x: number
  y: number
}

export interface PdfLine {
  x1: number
  y1: number
  x2: number
  y2: number
  /** The line width it is stroked with. */
  width: number
}

export interface PdfPage {
  glyphs: PdfGlyph[]
  /** Straight stroked segments. */
  lines: PdfLine[]
  /** The box around each filled shape, and its color as `#rrggbb`. */
  fills: { x0: number; y0: number; x1: number; y1: number; color: string }[]
  /** The page's text as pdf.js extracts it, one item per text run. */
  text: { str: string; x: number; y: number }[]
}

type Matrix = [number, number, number, number, number, number]

// pdf.js wants a trailing '/', which Windows paths from fileURLToPath lack.
const standardFontDataUrl = fileURLToPath(
  new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url),
).replaceAll('\\', '/')

function boxOf(path: ArrayLike<number>) {
  const xs: number[] = []
  const ys: number[] = []
  for (let at = 0; at < path.length;) {
    const count = PATH_ARGUMENTS[path[at++]]
    for (let i = 0; i < count; i += 2) {
      xs.push(path[at + i])
      ys.push(path[at + i + 1])
    }
    at += count
  }
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

export async function readPdf(bytes: Uint8Array): Promise<{ title?: string; pages: PdfPage[] }> {
  const loading = getDocument({
    data: bytes.slice(),
    disableFontFace: true,
    fontExtraProperties: true,
    standardFontDataUrl,
    verbosity: 0,
  })
  const document = await loading.promise
  const pages: PdfPage[] = []
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number)
    const operators = await page.getOperatorList()
    const glyphs: PdfGlyph[] = []
    const lines: PdfLine[] = []
    const fills: PdfPage['fills'] = []
    let font = ''
    let fontEmbedded = false
    let fontSize = 0
    let fillColor = '#000000'
    let lineWidth = 1
    let line: Matrix = [1, 0, 0, 1, 0, 0]
    let text: Matrix = line
    operators.fnArray.forEach((fn, i) => {
      const args = operators.argsArray[i]
      switch (fn) {
        case OPS.setLineWidth:
          lineWidth = args[0]
          break
        case OPS.setFillRGBColor:
          fillColor = args[0]
          break
        case OPS.beginText:
          line = text = [1, 0, 0, 1, 0, 0]
          break
        case OPS.setFont:
          font = page.commonObjs.get(args[0]).name
          fontEmbedded = !page.commonObjs.get(args[0]).missingFile
          fontSize = args[1]
          break
        case OPS.setTextMatrix:
          line = text = [...args[0]] as Matrix
          break
        case OPS.moveText:
          line = [line[0], line[1], line[2], line[3], line[4] + args[0] * line[0], line[5] + args[1] * line[3]]
          text = line
          break
        case OPS.constructPath: {
          const [paint, [path]] = args
          if (paint === OPS.fill && path) fills.push({ ...boxOf(path), color: fillColor })
          if (paint !== OPS.stroke || !path) break
          let x = 0
          let y = 0
          for (let at = 0; at < path.length;) {
            const op = path[at++]
            if (op !== MOVE_TO && op !== LINE_TO) {
              throw new Error(`readPdf reads only straight lines, not path operation ${op}`)
            }
            const [nextX, nextY] = [path[at++], path[at++]]
            if (op === LINE_TO) lines.push({ x1: x, y1: y, x2: nextX, y2: nextY, width: lineWidth })
            ;[x, y] = [nextX, nextY]
          }
          break
        }
        case OPS.showText:
          for (const glyph of args[0]) {
            if (typeof glyph === 'number') {
              // A TJ adjustment, in thousandths of the font size, moving the text back.
              text = [...text]
              text[4] -= (glyph * fontSize * text[0]) / 1000
              continue
            }
            glyphs.push({
              font,
              code: glyph.originalCharCode,
              unicode: glyph.unicode,
              embedded: fontEmbedded && glyph.isInFont,
              x: text[4],
              y: text[5],
            })
            text = [...text]
            text[4] += (glyph.width * fontSize * text[0]) / 1000
          }
          break
      }
    })
    const content = await page.getTextContent()
    pages.push({
      glyphs,
      lines,
      fills,
      text: content.items.flatMap((item) =>
        'str' in item && item.str.trim() !== '' ? [{ str: item.str, x: item.transform[4], y: item.transform[5] }] : [],
      ),
    })
  }
  const { info } = await document.getMetadata()
  const title = (info as { Title?: string }).Title
  await loading.destroy()
  return { title, pages }
}
