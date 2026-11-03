// What part of a chart the canvas shows, and how panning and zooming move it.
// Plain functions, so the renderer's logic is tested without pixels.

export interface Size {
  width: number
  height: number
}

/** The stitch at the canvas's top left (fractional), and how many pixels one stitch takes. */
export interface Viewport {
  x: number
  y: number
  cellSize: number
}

/** A block of cells: columns `left` to `right` and rows `top` to `bottom`, ends exclusive. */
export interface CellRange {
  left: number
  top: number
  right: number
  bottom: number
}

/** The cells at least partly inside the canvas. */
export function visibleCells({ x, y, cellSize }: Viewport, canvas: Size, chart: Size): CellRange {
  return {
    left: Math.max(0, Math.floor(x)),
    top: Math.max(0, Math.floor(y)),
    right: Math.min(chart.width, Math.ceil(x + canvas.width / cellSize)),
    bottom: Math.min(chart.height, Math.ceil(y + canvas.height / cellSize)),
  }
}

/** The smallest and largest a stitch can be drawn, in pixels. */
const MIN_CELL_SIZE = 2
const MAX_CELL_SIZE = 80

/** Zooms by `factor` about `point`, in canvas pixels, keeping the stitch under it in place. */
export function zoomAt({ x, y, cellSize }: Viewport, factor: number, point: { x: number; y: number }): Viewport {
  const zoomed = clampCellSize(cellSize * factor)
  return {
    x: x + point.x / cellSize - point.x / zoomed,
    y: y + point.y / cellSize - point.y / zoomed,
    cellSize: zoomed,
  }
}

/** Moves the chart by `drag`, in canvas pixels, so it follows the pointer. */
export function panBy({ x, y, cellSize }: Viewport, drag: { x: number; y: number }): Viewport {
  return { x: x - drag.x / cellSize, y: y - drag.y / cellSize, cellSize }
}

/**
 * The viewport that shows the whole chart as large as the canvas allows, centred.
 * A chart too big to fit even at the smallest stitch size starts at its top left.
 */
export function fitChart(canvas: Size, chart: Size): Viewport {
  const cellSize = clampCellSize(Math.min(canvas.width / chart.width, canvas.height / chart.height))
  const start = (chartStitches: number, canvasPixels: number) => {
    const shown = canvasPixels / cellSize
    return shown >= chartStitches ? (chartStitches - shown) / 2 : 0
  }
  return { x: start(chart.width, canvas.width), y: start(chart.height, canvas.height), cellSize }
}

function clampCellSize(cellSize: number) {
  return Math.min(MAX_CELL_SIZE, Math.max(MIN_CELL_SIZE, cellSize))
}
