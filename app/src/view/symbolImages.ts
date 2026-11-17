// Cuts each legend entry's symbol from its example cell in the source PDF, so
// the canvas draws symbols as the designer printed them. Browser only: it
// renders with pdf.js onto canvases.
import { getDocument, OPS, PDFWorker } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { ExampleCell, LegendEntry } from '../workspace/chart.ts'
import { maskFromPixels } from './symbolMask.ts'

/** One symbol, ready to draw in either ink. */
export interface SymbolImage {
  black: HTMLCanvasElement
  white: HTMLCanvasElement
}

/** Symbol images by legend entry, numbered from 1 as in a chart's cells. Entries left out have no example cell. */
export type SymbolImages = Map<number, SymbolImage>

/** How many pixels across a cut symbol is: enough to stay sharp at the largest zoom. */
const SYMBOL_PIXELS = 80
/** The share of the cell left out on each side, so grid lines aren't taken for the symbol. */
export const SYMBOL_INSET = 0.12

/** The operations that print text, which is how font symbols are printed. */
const TEXT_OPERATIONS = new Set<number>([
  OPS.showText,
  OPS.showSpacedText,
  OPS.nextLineShowText,
  OPS.nextLineSetSpacingShowText,
])
const withoutText: OperationsFilter = (index, { fnArray }) => !TEXT_OPERATIONS.has(fnArray[index])

/** Cuts the symbol of every legend entry that has an example cell. */
export async function cutSymbolImages(pdf: Uint8Array, legend: LegendEntry[]): Promise<SymbolImages> {
  // A worker of its own rather than pdf.js's global setting, which would change how every other pdf.js user loads.
  const port = new Worker(pdfWorkerUrl, { type: 'module' })
  const worker = PDFWorker.create({ port })
  const loading = getDocument({ data: pdf.slice(), worker, verbosity: 0 })
  try {
    const source = await loading.promise
    const images: SymbolImages = new Map()
    for (const [index, { example }] of legend.entries()) {
      if (!example) continue
      const page = await source.getPage(example.page)
      // The same cell without its symbol shows exactly what the symbol is printed on.
      const [printed, background] = [await renderCell(page, example), await renderCell(page, example, withoutText)]
      const mask = maskFromPixels(printed, background)
      images.set(index + 1, { black: inked(mask, printed, [0, 0, 0]), white: inked(mask, printed, [255, 255, 255]) })
    }
    return images
  } finally {
    await loading.destroy()
    worker.destroy()
    port.terminate()
  }
}

type Page = Awaited<ReturnType<Awaited<ReturnType<typeof getDocument>['promise']>['getPage']>>
/** Which of a page's operations to draw. pdf.js doesn't export its name for this. */
type OperationsFilter = NonNullable<Parameters<Page['render']>[0]['operationsFilter']>

/** The example cell, inset from its grid lines, rendered SYMBOL_PIXELS across. */
async function renderCell(page: Page, { box }: ExampleCell, operationsFilter?: OperationsFilter) {
  const [width, height] = [box.x1 - box.x0, box.y1 - box.y0]
  const [x0, x1] = [box.x0 + width * SYMBOL_INSET, box.x1 - width * SYMBOL_INSET]
  const [y0, y1] = [box.y0 + height * SYMBOL_INSET, box.y1 - height * SYMBOL_INSET]
  const scale = SYMBOL_PIXELS / (x1 - x0)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = SYMBOL_PIXELS
  canvas.height = Math.max(1, Math.round((y1 - y0) * scale))
  // The box is on the upright page with y up; the viewport draws it with y down.
  const [left, top] = [x0 * scale, viewport.height - y1 * scale]
  await page.render({ canvas, viewport, transform: [1, 0, 0, 1, -left, -top], operationsFilter }).promise
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
}

/** The symbol's ink in `rgb`, transparent everywhere else. */
function inked(mask: Uint8ClampedArray, pixels: ImageData, rgb: [number, number, number]) {
  const image = new ImageData(pixels.width, pixels.height)
  mask.forEach((ink, i) => image.data.set([...rgb, ink], i * 4))
  const canvas = document.createElement('canvas')
  canvas.width = pixels.width
  canvas.height = pixels.height
  canvas.getContext('2d')!.putImageData(image, 0, 0)
  return canvas
}
