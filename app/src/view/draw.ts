// Draws a chart on a canvas in layers, bottom to top. Later layers (adjustment
// markers, highlights) go on top of these.
import type { Chart } from '../workspace/chart.ts'
import { DONE, WHITE_FABRIC } from '../workspace/project.ts'
import type { CellPosition } from './cells.ts'
import { cellLook, type DisplayStyle } from './cellLook.ts'
import { detailAt, gridLineWeight, type Detail, type GridLineWeight } from './detail.ts'
import { fallbackSymbol } from './fallbackSymbol.ts'
import { dimmedCells } from './highlight.ts'
import { SYMBOL_INSET, type SymbolImage, type SymbolImages } from './symbolImages.ts'
import { visibleCells, type CellRange, type Size, type Viewport } from './viewport.ts'

/** What every layer draws from. */
interface Scene {
  chart: Chart
  viewport: Viewport
  /** The cells at least partly on screen; nothing outside them is drawn. */
  cells: CellRange
  style: DisplayStyle
  /** Symbols cut from the source PDF. An entry without one is drawn with a built-in symbol. */
  symbols: SymbolImages
  /** The project being stitched, when there is one. */
  project?: ProjectLook
}

/** What a project adds to the chart: its fabric, which stitches are done and the color they're marked in, and the cell cursor. */
export interface ProjectLook {
  fabricColor: string
  doneColor: string
  /** One state per cell, as in a project's progress. */
  progress: Uint8Array
  cursor?: CellPosition
  /** The legend entry highlighted, numbered from 1 as in the chart's cells; every other entry's stitches are dimmed. */
  highlighted?: number
}

/** How much of the fabric color is laid over a dimmed stitch: enough to set the highlighted entry apart, not hide the rest. */
const HIGHLIGHT_DIMMING = 0.75

/** How much of the done color is laid over a done stitch, so it stands out but its symbol stays readable. */
const DONE_DIMMING = 0.7

/** The cell cursor: the selection color, thick enough to see on any thread color. */
const CURSOR = { color: '#7a3b69', width: 3, smallest: 8 }

type Layer = (context: CanvasRenderingContext2D, scene: Scene) => void

const GRID: Record<GridLineWeight, { color: string; width: number }> = {
  thin: { color: 'rgba(0, 0, 0, 0.25)', width: 1 },
  thick: { color: 'rgba(0, 0, 0, 0.6)', width: 2 },
}

/** Each chart's cell fills, one pixel a stitch, by how they're drawn, made the first time each is needed. */
const fillImages = new WeakMap<Chart, Map<string, HTMLCanvasElement>>()

/**
 * Every cell's fill in `style` at the zoom that gives `detail`, one pixel a stitch, so drawing it scaled is one call
 * however many stitches are on screen. Zoomed out, every display style shows color only, so one image serves them all.
 */
function fillImage(chart: Chart, style: DisplayStyle, detail: Detail) {
  const key = detail.symbols ? style : 'zoomed out'
  let images = fillImages.get(chart)
  if (!images) fillImages.set(chart, (images = new Map()))
  let image = images.get(key)
  if (image) return image
  // Each legend entry's fill once, as [r, g, b, a]; a blank cell is clear, so the fabric shows through.
  const colors = [[0, 0, 0, 0], ...chart.legend.map((entry) => [...rgb(cellLook(entry, style, detail).fill), 255])]
  const pixels = new ImageData(chart.width, chart.height)
  chart.cells.forEach((entry, i) => pixels.data.set(colors[entry] ?? colors[0], i * 4))
  image = document.createElement('canvas')
  image.width = chart.width
  image.height = chart.height
  image.getContext('2d')!.putImageData(pixels, 0, 0)
  images.set(key, image)
  return image
}

function rgb(color: string) {
  return [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16))
}

/** The fabric under the chart, which blank cells show. */
const fabricLayer: Layer = (context, { chart, viewport: { x, y, cellSize }, project }) => {
  context.fillStyle = project?.fabricColor ?? WHITE_FABRIC
  context.fillRect(-x * cellSize, -y * cellSize, chart.width * cellSize, chart.height * cellSize)
}

/** Each project's done stitches, one pixel a stitch, made each time its progress changes. */
const doneImages = new WeakMap<Uint8Array, { color: string; image: HTMLCanvasElement }>()

/** Done stitches in the done color, one pixel a stitch, so they're marked in one call. */
function doneImage({ progress, doneColor }: ProjectLook, chart: Chart) {
  const made = doneImages.get(progress)
  if (made?.color === doneColor) return made.image
  const done = [...rgb(doneColor), 255]
  const pixels = new ImageData(chart.width, chart.height)
  progress.forEach((state, i) => state === DONE && pixels.data.set(done, i * 4))
  const image = document.createElement('canvas')
  image.width = chart.width
  image.height = chart.height
  image.getContext('2d')!.putImageData(pixels, 0, 0)
  doneImages.set(progress, { color: doneColor, image })
  return image
}

/** Done stitches, under a wash of the done color. */
const progressLayer: Layer = (context, { chart, viewport: { x, y, cellSize }, project }) => {
  if (!project) return
  context.save()
  context.globalAlpha = DONE_DIMMING
  // One call at any zoom, sharp-edged: marking each done stitch alone is too slow with thousands on screen.
  context.imageSmoothingEnabled = false
  context.drawImage(
    doneImage(project, chart),
    -x * cellSize,
    -y * cellSize,
    chart.width * cellSize,
    chart.height * cellSize,
  )
  context.restore()
}

/** Each chart's dimmed cells while one entry is highlighted, one pixel a stitch, made each time the highlight changes. */
const dimImages = new WeakMap<Chart, { entry: number; fabric: string; image: HTMLCanvasElement }>()

/** The stitches dimmed by a highlight, in the fabric color, one pixel a stitch, so they're dimmed in one call. */
function dimImage(chart: Chart, entry: number, fabric: string) {
  const made = dimImages.get(chart)
  if (made?.entry === entry && made.fabric === fabric) return made.image
  const color = [...rgb(fabric), 255]
  const pixels = new ImageData(chart.width, chart.height)
  dimmedCells(chart.cells, entry).forEach((dimmed, i) => dimmed && pixels.data.set(color, i * 4))
  const image = document.createElement('canvas')
  image.width = chart.width
  image.height = chart.height
  image.getContext('2d')!.putImageData(pixels, 0, 0)
  dimImages.set(chart, { entry, fabric, image })
  return image
}

/** Every other entry's stitches, under a wash of the fabric color, while one entry is highlighted. */
const highlightLayer: Layer = (context, { chart, viewport: { x, y, cellSize }, project }) => {
  if (project?.highlighted === undefined) return
  context.save()
  context.globalAlpha = HIGHLIGHT_DIMMING
  // One call at any zoom, sharp-edged, like the done stitches.
  context.imageSmoothingEnabled = false
  context.drawImage(
    dimImage(chart, project.highlighted, project.fabricColor),
    -x * cellSize,
    -y * cellSize,
    chart.width * cellSize,
    chart.height * cellSize,
  )
  context.restore()
}

/** The selection layer: the cell cursor, the one cell the keyboard acts on. */
const selectionLayer: Layer = (context, { viewport: { x, y, cellSize }, project }) => {
  const cursor = project?.cursor
  if (!cursor) return
  // Zoomed out, a box bigger than the cell, so it can still be seen.
  const size = Math.max(cellSize, CURSOR.smallest)
  const left = (cursor.column - x) * cellSize + (cellSize - size) / 2
  const top = (cursor.row - y) * cellSize + (cellSize - size) / 2
  context.strokeStyle = CURSOR.color
  context.lineWidth = CURSOR.width
  context.strokeRect(left, top, size, size)
}

/** Each cell as its display style draws it, with its symbol as printed where the source PDF gave one. */
const cellsLayer: Layer = (context, { chart, viewport: { x, y, cellSize }, cells, style, symbols }) => {
  const { left, top, right, bottom } = cells
  const detail = detailAt(cellSize)
  // Every fill in one call, sharp-edged, not a blur between stitches. Drawing each cell's fill alone is too slow
  // to pan smoothly with thousands of stitches on a large canvas.
  context.imageSmoothingEnabled = false
  context.drawImage(
    fillImage(chart, style, detail),
    -x * cellSize,
    -y * cellSize,
    chart.width * cellSize,
    chart.height * cellSize,
  )
  context.imageSmoothingEnabled = true
  if (!detail.symbols) return
  // Each entry's symbols in one fill: a path through its cells on screen, painted with its symbol repeated a cell
  // apart. Drawing each cell's symbol alone is too slow to pan smoothly with thousands of stitches on screen.
  const paths = chart.legend.map(() => new Path2D())
  for (let row = top; row < bottom; row++) {
    for (let column = left; column < right; column++) {
      const entry = chart.cells[row * chart.width + column]
      // Blank cells show the fabric.
      if (entry !== 0) paths[entry - 1].rect((column - x) * cellSize, (row - y) * cellSize, cellSize, cellSize)
    }
  }
  // A whole number of device pixels a tile, scaled back to exactly a cell, so the symbols never drift off their cells.
  const tilePixels = Math.max(1, Math.round(cellSize * context.getTransform().a))
  const placed = new DOMMatrix().translateSelf(-x * cellSize, -y * cellSize).scaleSelf(cellSize / tilePixels)
  chart.legend.forEach((legendEntry, i) => {
    const ink = cellLook(legendEntry, style, detail).symbol
    if (!ink) return
    const pattern = context.createPattern(symbolTile(i + 1, ink, symbols.get(i + 1), tilePixels), 'repeat')
    if (!pattern) return
    pattern.setTransform(placed)
    context.fillStyle = pattern
    context.fill(paths[i])
  })
}

/** One cell's symbol, `pixels` across, on a clear tile: the symbol as printed, or a built-in one in `ink`. */
function symbolTile(entry: number, ink: string, image: SymbolImage | undefined, pixels: number) {
  const tile = document.createElement('canvas')
  tile.width = pixels
  tile.height = pixels
  const context = tile.getContext('2d')!
  if (image) {
    // Cut inset from the cell's grid lines, so drawn back at the same inset.
    const inset = pixels * SYMBOL_INSET
    context.drawImage(
      ink === '#ffffff' ? image.white : image.black,
      inset,
      inset,
      pixels - 2 * inset,
      pixels - 2 * inset,
    )
  } else {
    context.font = `${Math.round(pixels * 0.6)}px system-ui, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = ink
    context.fillText(fallbackSymbol(entry), pixels / 2, pixels / 2)
  }
  return tile
}

/** Thin lines first, so the thick lines every 10 stitches draw over them where they cross. */
const gridLayer: Layer = (context, { viewport: { x, y, cellSize }, cells: { left, top, right, bottom } }) => {
  if (!detailAt(cellSize).gridLines) return
  for (const weight of ['thin', 'thick'] as const) {
    const { color, width } = GRID[weight]
    // Odd widths sit on half pixels to stay sharp.
    const offset = width % 2 ? 0.5 : 0
    context.strokeStyle = color
    context.lineWidth = width
    context.beginPath()
    for (let column = left; column <= right; column++) {
      if (gridLineWeight(column) !== weight) continue
      const px = Math.round((column - x) * cellSize) + offset
      context.moveTo(px, (top - y) * cellSize)
      context.lineTo(px, (bottom - y) * cellSize)
    }
    for (let row = top; row <= bottom; row++) {
      if (gridLineWeight(row) !== weight) continue
      const py = Math.round((row - y) * cellSize) + offset
      context.moveTo((left - x) * cellSize, py)
      context.lineTo((right - x) * cellSize, py)
    }
    context.stroke()
  }
}

const LAYERS: Layer[] = [fabricLayer, cellsLayer, progressLayer, highlightLayer, gridLayer, selectionLayer]

/** Draws the visible part of `chart` in `style` on a canvas `size` CSS pixels across, with the project's progress if there is one. */
export function drawChart(
  context: CanvasRenderingContext2D,
  chart: Chart,
  viewport: Viewport,
  size: Size,
  style: DisplayStyle,
  symbols: SymbolImages,
  project?: ProjectLook,
) {
  context.clearRect(0, 0, size.width, size.height)
  const scene = { chart, viewport, cells: visibleCells(viewport, size, chart), style, symbols, project }
  for (const layer of LAYERS) layer(context, scene)
}
