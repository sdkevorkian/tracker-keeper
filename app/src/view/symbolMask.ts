// Turns a cell cut from the source PDF into its symbol's ink, so the symbol
// can be painted in whatever color stands out on the cell it's drawn in.

/** Pixels as a canvas gives them: RGBA, row by row. */
export interface Pixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

/**
 * How much ink each pixel holds, 0 to 255, from the cell as printed and the
 * same cell printed without its symbol: how far each pixel moved from its
 * background, as a share of the farthest any pixel moved. So grid lines and
 * cell colors are never ink, and the symbol's solid parts are full ink
 * whatever it was printed on, even where it fills the cell.
 */
export function maskFromPixels(printed: Pixels, background: Pixels): Uint8ClampedArray {
  const distances = Array.from({ length: printed.width * printed.height }, (_, i) =>
    Math.max(...[0, 1, 2].map((channel) => Math.abs(printed.data[i * 4 + channel] - background.data[i * 4 + channel]))),
  )
  const farthest = Math.max(...distances)
  return Uint8ClampedArray.from(distances, (distance) => (farthest ? (distance * 255) / farthest : 0))
}
