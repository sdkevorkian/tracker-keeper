/** A symbol printed as a font character: the font's name and the raw character code. */
export interface SymbolKey {
  font: string
  code: number
}

export interface Thread {
  brand: string
  /** For example '310'. */
  code: string
  name: string
  strands: number
}

export interface LegendEntry {
  symbol: SymbolKey
  /** More than one thread makes a blend. */
  threads: Thread[]
  /** As `#RRGGBB`, or undefined when no color is known. */
  color?: string
  /** The stitch count the legend prints. */
  printedCount: number
}

export interface Chart {
  id: string
  width: number
  height: number
  /** One value per cell, row by row from the top left: 0 is blank, n is legend entry n (1-based). */
  cells: Uint16Array
  legend: LegendEntry[]
}
