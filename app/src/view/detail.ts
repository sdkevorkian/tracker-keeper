// How much the canvas draws at each zoom: color only when zoomed out, then
// symbols, then grid lines. Plain functions, so they're tested without pixels.

/** What the canvas draws on top of each cell's color. */
export interface Detail {
  symbols: boolean
  gridLines: boolean
}

/** Below this many pixels a stitch, symbols are too small to read. */
const MIN_SYMBOL_CELL_SIZE = 10
/** Below this many pixels a stitch, grid lines would crowd out the cells. */
const MIN_GRID_CELL_SIZE = 20

/** What shows when a stitch is drawn `cellSize` pixels across. */
export function detailAt(cellSize: number): Detail {
  return { symbols: cellSize >= MIN_SYMBOL_CELL_SIZE, gridLines: cellSize >= MIN_GRID_CELL_SIZE }
}

/** Grid lines are counted from the chart's top or left edge, so line 0 is its edge. */
export type GridLineWeight = 'thin' | 'thick'

/** Every 10th line is thicker, like a printed chart, so stitches can be counted in tens. */
export function gridLineWeight(line: number): GridLineWeight {
  return line % 10 === 0 ? 'thick' : 'thin'
}
