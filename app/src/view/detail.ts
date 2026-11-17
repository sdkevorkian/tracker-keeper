// How much the canvas draws at each zoom: color only when zoomed out, then
// symbols and grid lines together. Plain functions, so they're tested without pixels.

/** What the canvas draws on top of each cell's color. */
export interface Detail {
  symbols: boolean
  gridLines: boolean
}

/** Below this many pixels a stitch, symbols are too small to read, and grid lines would crowd out the cells. */
const MIN_DETAIL_CELL_SIZE = 10

/** What shows when a stitch is drawn `cellSize` pixels across. Grid lines come with the symbols, so stitches can be counted. */
export function detailAt(cellSize: number): Detail {
  const detailed = cellSize >= MIN_DETAIL_CELL_SIZE
  return { symbols: detailed, gridLines: detailed }
}

/** Grid lines are counted from the chart's top or left edge, so line 0 is its edge. */
export type GridLineWeight = 'thin' | 'thick'

/** Every 10th line is thicker, like a printed chart, so stitches can be counted in tens. */
export function gridLineWeight(line: number): GridLineWeight {
  return line % 10 === 0 ? 'thick' : 'thin'
}
