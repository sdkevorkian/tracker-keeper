// Draws a chart on a canvas in layers, bottom to top. Later layers (progress,
// adjustment markers, highlights) go on top of these.
import type { Chart } from '../workspace/chart.ts'
import { visibleCells, type CellRange, type Size, type Viewport } from './viewport.ts'

type Layer = (context: CanvasRenderingContext2D, chart: Chart, viewport: Viewport, cells: CellRange) => void

const BLANK = '#ffffff'
const NO_COLOR = '#d9d9d9'
const GRID = 'rgba(0, 0, 0, 0.25)'

/** Below this many pixels a stitch, symbols are too small to read. */
const MIN_SYMBOL_CELL_SIZE = 10

/** Each cell's color, with its legend entry's number standing in for the symbol until #18 adds symbol images. */
const cellsLayer: Layer = (context, chart, { x, y, cellSize }, { left, top, right, bottom }) => {
  context.font = `${Math.round(cellSize * 0.6)}px system-ui, sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  for (let row = top; row < bottom; row++) {
    for (let column = left; column < right; column++) {
      const entry = chart.cells[row * chart.width + column]
      const color = entry === 0 ? BLANK : (chart.legend[entry - 1]?.color ?? NO_COLOR)
      const px = (column - x) * cellSize
      const py = (row - y) * cellSize
      context.fillStyle = color
      context.fillRect(px, py, cellSize, cellSize)
      if (entry !== 0 && cellSize >= MIN_SYMBOL_CELL_SIZE) {
        context.fillStyle = isDark(color) ? '#ffffff' : '#000000'
        context.fillText(String(entry), px + cellSize / 2, py + cellSize / 2)
      }
    }
  }
}

const gridLayer: Layer = (context, _chart, { x, y, cellSize }, { left, top, right, bottom }) => {
  context.strokeStyle = GRID
  context.lineWidth = 1
  context.beginPath()
  for (let column = left; column <= right; column++) {
    const px = Math.round((column - x) * cellSize) + 0.5
    context.moveTo(px, (top - y) * cellSize)
    context.lineTo(px, (bottom - y) * cellSize)
  }
  for (let row = top; row <= bottom; row++) {
    const py = Math.round((row - y) * cellSize) + 0.5
    context.moveTo((left - x) * cellSize, py)
    context.lineTo((right - x) * cellSize, py)
  }
  context.stroke()
}

const LAYERS: Layer[] = [cellsLayer, gridLayer]

/** Draws the visible part of `chart` on a canvas `size` CSS pixels across. */
export function drawChart(context: CanvasRenderingContext2D, chart: Chart, viewport: Viewport, size: Size) {
  context.clearRect(0, 0, size.width, size.height)
  const cells = visibleCells(viewport, size, chart)
  for (const layer of LAYERS) layer(context, chart, viewport, cells)
}

function isDark(color: string) {
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16))
  return 0.299 * r + 0.587 * g + 0.114 * b < 128
}
