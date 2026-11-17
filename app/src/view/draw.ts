// Draws a chart on a canvas in layers, bottom to top. Later layers (progress,
// adjustment markers, highlights) go on top of these.
import type { Chart } from '../workspace/chart.ts'
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
}

type Layer = (context: CanvasRenderingContext2D, scene: Scene) => void

const GRID: Record<GridLineWeight, { color: string; width: number }> = {
  thin: { color: 'rgba(0, 0, 0, 0.25)', width: 1 },
  thick: { color: 'rgba(0, 0, 0, 0.6)', width: 2 },
}

/** Each cell as its display style draws it, with its symbol as printed where the source PDF gave one. */
const cellsLayer: Layer = (context, { chart, viewport: { x, y, cellSize }, cells, style, symbols }) => {
  const { left, top, right, bottom } = cells
  const detail = detailAt(cellSize)
  context.font = `${Math.round(cellSize * 0.6)}px system-ui, sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  for (let row = top; row < bottom; row++) {
    for (let column = left; column < right; column++) {
      const entry = chart.cells[row * chart.width + column]
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

const LAYERS: Layer[] = [cellsLayer, gridLayer]

/** Draws the visible part of `chart` in `style` on a canvas `size` CSS pixels across. */
export function drawChart(
  context: CanvasRenderingContext2D,
  chart: Chart,
  viewport: Viewport,
  size: Size,
  style: DisplayStyle,
  symbols: SymbolImages,
) {
  context.clearRect(0, 0, size.width, size.height)
  const scene = { chart, viewport, cells: visibleCells(viewport, size, chart), style, symbols }
  for (const layer of LAYERS) layer(context, scene)
}
