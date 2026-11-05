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

/** Which stitches one page of the source PDF covers, numbered from 1 like a printed chart's margins. Ends are inclusive. */
export interface SourcePage {
  /** The page's number in the source PDF, from 1. */
  page: number
  across: [first: number, last: number]
  down: [first: number, last: number]
}

/** What the chart was imported from, kept so the source PDF can be opened at the matching page. */
export interface SourceReference {
  /** The source PDF's SHA-256, as lowercase hex, so the stitcher's copy can be told from any other. */
  pdfSha256: string
  pages: SourcePage[]
}

export interface Size {
  width: number
  height: number
}

/** A problem the import found that suggests the chart doesn't match its source PDF. */
export type ImportIssue =
  /** The chart's size differs from the size the source PDF prints, often from pages joined wrongly. */
  | { kind: 'size mismatch'; printed: Size; parsed: Size }
  /** The chart's cells are filled in but hold no symbols, as when a PDF prints it only as color blocks. */
  | { kind: 'no symbols' }
  /** A legend entry's printed stitch count differs from how many cells the import gave it. */
  | {
      kind: 'legend count mismatch'
      /** The legend entry, numbered from 1 as in `cells`. */
      entry: number
      printed: number
      parsed: number
      /** The entry's cells, as indexes into `cells`. */
      cells: number[]
    }
  /** A legend entry that no cell uses. */
  | { kind: 'legend entry with no stitches'; /** The legend entry, numbered from 1 as in `cells`. */ entry: number }
  /** A symbol printed in the chart that the legend doesn't list. Its cells are left blank. */
  | {
      kind: 'symbol not in legend'
      symbol: SymbolKey
      /** The symbol's cells, as indexes into `cells`. */
      cells: number[]
    }

export interface Chart {
  id: string
  /** The chart's name, from its source PDF where it prints one. */
  title?: string
  width: number
  height: number
  /** One value per cell, row by row from the top left: 0 is blank, n is legend entry n (1-based). */
  cells: Uint16Array
  legend: LegendEntry[]
  source: SourceReference
  importIssues: ImportIssue[]
}
