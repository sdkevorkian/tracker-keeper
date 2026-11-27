// Highlighting one legend entry, so the stitcher can work one color at a time.

/** One flag per cell: 1 where a stitch belongs to another legend entry than `entry`, so it's drawn dimmed. Blank cells aren't. */
export function dimmedCells(cells: Uint16Array, entry: number) {
  return cells.map((cell) => (cell !== 0 && cell !== entry ? 1 : 0))
}
