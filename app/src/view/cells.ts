// Which cells the stitcher points at, and the runs of cells a drag or the
// keyboard crosses. Plain functions, so marking is tested without pixels.
import type { Point, Size, Viewport } from './viewport.ts'

/** One cell of a chart, numbered from 0 at the top left. */
export interface CellPosition {
  column: number
  row: number
}

/** The cell under `point`, in canvas pixels, or undefined when it's off the chart. */
export function cellAt({ x, y, cellSize }: Viewport, point: Point, chart: Size): CellPosition | undefined {
  const column = Math.floor(x + point.x / cellSize)
  const row = Math.floor(y + point.y / cellSize)
  if (column < 0 || row < 0 || column >= chart.width || row >= chart.height) return undefined
  return { column, row }
}

/** Every cell on the line from `from` to `to`, both included, in order, each next to the one before. */
export function cellsBetween(from: CellPosition, to: CellPosition): CellPosition[] {
  const steps = Math.max(Math.abs(to.column - from.column), Math.abs(to.row - from.row))
  return Array.from({ length: steps + 1 }, (_, step) => {
    const along = steps === 0 ? 0 : step / steps
    return {
      column: Math.round(from.column + (to.column - from.column) * along),
      row: Math.round(from.row + (to.row - from.row) * along),
    }
  })
}

const ARROWS: Record<string, { column: number; row: number } | undefined> = {
  ArrowLeft: { column: -1, row: 0 },
  ArrowRight: { column: 1, row: 0 },
  ArrowUp: { column: 0, row: -1 },
  ArrowDown: { column: 0, row: 1 },
}

/** Where an arrow key moves the cell cursor, staying on the chart, or undefined for any other key. */
export function cursorForKey(cursor: CellPosition, key: string, chart: Size): CellPosition | undefined {
  const step = ARROWS[key]
  if (!step) return undefined
  return {
    column: Math.min(chart.width - 1, Math.max(0, cursor.column + step.column)),
    row: Math.min(chart.height - 1, Math.max(0, cursor.row + step.row)),
  }
}

/** The view moved just enough to show all of `cell`, or `viewport` itself when it's already in sight. */
export function viewportShowing(viewport: Viewport, cell: CellPosition, canvas: Size): Viewport {
  const { x, y, cellSize } = viewport
  // How many stitches the canvas shows across and down.
  const across = canvas.width / cellSize
  const down = canvas.height / cellSize
  const shown = (start: number, cellStart: number, span: number) =>
    Math.min(cellStart, Math.max(start, cellStart + 1 - span))
  const moved = { x: shown(x, cell.column, across), y: shown(y, cell.row, down), cellSize }
  return moved.x === x && moved.y === y ? viewport : moved
}
