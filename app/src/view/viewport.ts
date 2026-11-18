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

/** How much one press of a zoom button or key zooms. */
export const ZOOM_STEP = 2

/** The middle of the canvas, which the zoom buttons and keys zoom about. */
export function centreOf(canvas: Size) {
  return { x: canvas.width / 2, y: canvas.height / 2 }
}

/** A key pressed while the chart has focus. */
export interface KeyPress {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

/** Where a key moves the view, or undefined when the key doesn't move it. */
export function viewportForKey(
  viewport: Viewport,
  { key, shiftKey, ctrlKey, metaKey }: KeyPress,
  canvas: Size,
  chart: Size,
): Viewport | undefined {
  if (ctrlKey || metaKey) return undefined
  switch (key) {
    case '+':
    case '=':
      return zoomAt(viewport, ZOOM_STEP, centreOf(canvas))
    case '-':
      return zoomAt(viewport, 1 / ZOOM_STEP, centreOf(canvas))
    case '0':
      return fitChart(canvas, chart)
  }
  const direction = ARROWS[key]
  if (!direction) return undefined
  // A screen with Shift, otherwise a few stitches, in canvas pixels.
  const step = shiftKey
    ? canvas
    : { width: KEY_PAN_STITCHES * viewport.cellSize, height: KEY_PAN_STITCHES * viewport.cellSize }
  // The view moves the arrow's way, so the chart is dragged the other way.
  return panBy(viewport, { x: -direction.x * step.width, y: -direction.y * step.height })
}

/** How much one pixel of pinch, or of wheel with Ctrl held, zooms. */
const WHEEL_ZOOM = 0.002

/** A wheel or trackpad turn over the chart, with `point` in canvas pixels. */
export interface WheelTurn {
  deltaX: number
  deltaY: number
  shiftKey?: boolean
  ctrlKey?: boolean
  point: { x: number; y: number }
}

/** Where a wheel or trackpad turn moves the view. */
export function viewportForWheel(
  viewport: Viewport,
  { deltaX, deltaY, shiftKey, ctrlKey, point }: WheelTurn,
): Viewport {
  // Chrome reports a trackpad pinch as a wheel turn with Ctrl held.
  if (ctrlKey) return zoomAt(viewport, Math.exp(-deltaY * WHEEL_ZOOM), point)
  // Shift turns a mouse wheel sideways, where the browser hasn't already.
  if (shiftKey && deltaX === 0) return panBy(viewport, { x: -deltaY, y: 0 })
  // Scrolling moves the view the way it scrolls, so the chart is dragged the other way.
  return panBy(viewport, { x: -deltaX, y: -deltaY })
}

/** A place on the canvas, in canvas pixels. */
export type Point = { x: number; y: number }

/** Where two fingers moving from `before` to `after`, in canvas pixels, move the view. */
export function viewportForPinch(
  viewport: Viewport,
  before: readonly [Point, Point],
  after: readonly [Point, Point],
): Viewport {
  const [from, to] = [midpoint(before), midpoint(after)]
  // Zoom about where the fingers were, then follow them as a drag would.
  const zoomed = zoomAt(viewport, distance(after) / distance(before), from)
  return panBy(zoomed, { x: to.x - from.x, y: to.y - from.y })
}

function distance([a, b]: readonly [Point, Point]) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function midpoint([a, b]: readonly [Point, Point]) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** How many stitches an arrow key pans. */
const KEY_PAN_STITCHES = 5

const ARROWS: Record<string, { x: number; y: number } | undefined> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
}

function clampCellSize(cellSize: number) {
  return Math.min(MAX_CELL_SIZE, Math.max(MIN_CELL_SIZE, cellSize))
}
