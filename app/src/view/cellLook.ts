// How one cell looks in each display style. A plain function, so the styles
// are tested without pixels; the canvas only paints what it says.
import type { LegendEntry } from '../workspace/chart.ts'
import type { DisplayStyle } from '../workspace/project.ts'
import type { Detail } from './detail.ts'

export type { DisplayStyle }

/** A cell's background, and the ink its symbol is drawn in, or no symbol. */
export interface CellLook {
  fill: string
  symbol?: string
}

const BLACK = '#000000'
const WHITE = '#ffffff'
/** For a legend entry whose color isn't known; light enough to read a black symbol on. */
const NO_COLOR = '#d9d9d9'

/** How a cell of `entry`, or a blank cell, looks in `style`, at the zoom that gives `detail`. */
export function cellLook(entry: LegendEntry | undefined, style: DisplayStyle, { symbols }: Detail): CellLook {
  if (!entry) return { fill: WHITE }
  const fill = entry.color ?? NO_COLOR
  // Too small to read, symbols would leave a symbols-only chart blank, so every style shows color.
  if (style === 'color blocks' || !symbols) return { fill }
  if (style === 'symbols only') return { fill: WHITE, symbol: BLACK }
  return { fill, symbol: isDark(fill) ? WHITE : BLACK }
}

function isDark(color: string) {
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16))
  return 0.299 * r + 0.587 * g + 0.114 * b < 128
}
