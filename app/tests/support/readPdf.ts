// Reads a PDF the way the import will: with pdf.js, reporting each glyph's
// font name, character code and position, plus the page's text.
import { fileURLToPath } from 'node:url'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

export interface PdfGlyph {
  font: string
  code: number
  unicode: string
  /** Drawn from the font embedded in the PDF, not a substitute. */
  embedded: boolean
  x: number
  y: number
}

export interface PdfPage {
  glyphs: PdfGlyph[]
  /** The page's text as pdf.js extracts it, one item per text run. */
  text: { str: string; x: number; y: number }[]
}

type Matrix = [number, number, number, number, number, number]

// pdf.js wants a trailing '/', which Windows paths from fileURLToPath lack.
const standardFontDataUrl = fileURLToPath(
  new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url),
).replaceAll('\\', '/')

export async function readPdf(bytes: Uint8Array): Promise<{ pages: PdfPage[] }> {
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
    let font = ''
    let fontEmbedded = false
    let fontSize = 0
    let line: Matrix = [1, 0, 0, 1, 0, 0]
    let text: Matrix = line
    operators.fnArray.forEach((fn, i) => {
      const args = operators.argsArray[i]
      switch (fn) {
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
        case OPS.showText:
          for (const glyph of args[0]) {
            if (typeof glyph === 'number') continue
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
      text: content.items.flatMap((item) =>
        'str' in item && item.str.trim() !== ''
          ? [{ str: item.str, x: item.transform[4], y: item.transform[5] }]
          : [],
      ),
    })
  }
  await loading.destroy()
  return { pages }
}
