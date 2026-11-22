// Draws a chart on a canvas in layers, bottom to top. Later layers (adjustment
// markers, highlights) go on top of these.
import type { Chart } from '../workspace/chart.ts'
import { DONE, WHITE_FABRIC } from '../workspace/project.ts'
import type { CellPosition } from './cells.ts'
import { cellLook, type DisplayStyle } from './cellLook.ts'
import { detailAt, gridLineWeight, type GridLineWeight } from './detail.ts'
import { fallbackSymbol } from './fallbackSymbol.ts'
import { SYMBOL_INSET, type SymbolImages } from './symbolImages.ts'
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
}

/** How much of the done color is laid over a done stitch, so it stands out but its symbol stays readable. */
const DONE_DIMMING = 0.7

/** The cell cursor: the selection color, thick enough to see on any thread color. */
const CURSOR = { color: '#7a3b69', width: 3, smallest: 8 }

type Layer = (context: CanvasRenderingContext2D, scene: Scene) => void

const GRID: Record<GridLineWeight, { color: string; width: number }> = {
  thin: { color: 'rgba(0, 0, 0, 0.25)', width: 1 },
  thick: { color: 'rgba(0, 0, 0, 0.6)', width: 2 },
}

/** Each chart's colors, one pixel a stitch, made the first time it's drawn zoomed out. */
const colorImages = new WeakMap<Chart, HTMLCanvasElement>()

/**
 * The chart as it looks zoomed out, one pixel a stitch. Zoomed out, every display style
 * shows color only, so one image serves them all, and drawing it scaled is one call
 * however many stitches are on screen.
 */
function colorImage(chart: Chart) {
  let image = colorImages.get(chart)
  if (image) return image
  const zoomedOut = { symbols: false, gridLines: false }
  // Each legend entry's color once, as [r, g, b, a]; a blank cell is clear, so the fabric shows through.
  const colors = [
    [0, 0, 0, 0],
    ...chart.legend.map((entry) => [...rgb(cellLook(entry, 'color blocks', zoomedOut).fill), 255]),
  ]
  const pixels = new ImageData(chart.width, chart.height)
  chart.cells.forEach((entry, i) => pixels.data.set(colors[entry] ?? colors[0], i * 4))
  image = document.createElement('canvas')
  image.width = chart.width
  image.height = chart.height
  image.getContext('2d')!.putImageData(pixels, 0, 0)
  colorImages.set(chart, image)
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

/** Done stitches in the done color, one pixel a stitch, so zoomed out they're marked in one call. */
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
const progressLayer: Layer = (context, { chart, viewport: { x, y, cellSize }, cells, project }) => {
  if (!project) return
  context.save()
  context.globalAlpha = DONE_DIMMING
  if (!detailAt(cellSize).symbols) {
    context.imageSmoothingEnabled = false
    context.drawImage(
      doneImage(project, chart),
      -x * cellSize,
      -y * cellSize,
      chart.width * cellSize,
      chart.height * cellSize,
    )
  } else {
    context.fillStyle = project.doneColor
    for (let row = cells.top; row < cells.bottom; row++) {
      for (let column = cells.left; column < cells.right; column++) {
        if (project.progress[row * chart.width + column] !== DONE) continue
        context.fillRect((column - x) * cellSize, (row - y) * cellSize, cellSize, cellSize)
      }
    }
  }
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
  if (!detail.symbols) {
    // Sharp-edged stitches, not a blur between them.
    context.imageSmoothingEnabled = false
    context.drawImage(colorImage(chart), -x * cellSize, -y * cellSize, chart.width * cellSize, chart.height * cellSize)
    return
  }
  context.font = `${Math.round(cellSize * 0.6)}px system-ui, sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  for (let row = top; row < bottom; row++) {
    for (let column = left; column < right; column++) {
      const entry = chart.cells[row * chart.width + column]
      // Blank cells show the fabric.
      if (entry === 0) continue
      const { fill, symbol } = cellLook(entry === 0 ? undefined : chart.legend[entry - 1], style, detail)
      const px = (column - x) * cellSize
      const py = (row - y) * cellSize
      context.fillStyle = fill
      context.fillRect(px, py, cellSize, cellSize)
      if (!symbol) continue
      const image = symbols.get(entry)
      if (image) {
        // Cut inset from the cell's grid lines, so drawn back at the same inset.
        const inset = cellSize * SYMBOL_INSET
        const drawn = cellSize - 2 * inset
        context.drawImage(symbol === '#ffffff' ? image.white : image.black, px + inset, py + inset, drawn, drawn)
      } else {
        context.fillStyle = symbol
        context.fillText(fallbackSymbol(entry), px + cellSize / 2, py + cellSize / 2)
      }
    }
  }
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

const LAYERS: Layer[] = [fabricLayer, cellsLayer, progressLayer, gridLayer, selectionLayer]

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
