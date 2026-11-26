import { useEffect, useRef } from 'react'
import { fallbackSymbol } from '../view/fallbackSymbol.ts'
import type { SymbolImages } from '../view/symbolImages.ts'
import type { LegendEntry } from '../workspace/chart.ts'

/** A legend entry's threads as the stitcher reads them, such as 'DMC 310' or 'DMC 310 + DMC 3371' for a blend. */
export function threadsOf({ threads }: LegendEntry) {
  return threads.map(({ brand, code }) => `${brand} ${code}`).join(' + ')
}

/**
 * The project's legend: each entry's symbol, threads and color, and how many stitches it has left.
 * Each entry is a button that highlights it, and pressing the highlighted one again clears it.
 */
export function LegendPanel({
  legend,
  stitchesLeft,
  symbols,
  highlighted,
  onHighlight,
}: {
  legend: LegendEntry[]
  /** In legend order. */
  stitchesLeft: number[]
  symbols: SymbolImages
  /** The highlighted entry, numbered from 1 as in a chart's cells, or undefined when none is. */
  highlighted?: number
  onHighlight: (entry: number | undefined) => void
}) {
  return (
    <ul className="legend-panel" aria-label="Legend">
      {legend.map((entry, i) => {
        const number = i + 1
        const threads = threadsOf(entry)
        const names = entry.threads.flatMap(({ name }) => (name ? [name] : [])).join(' + ')
        const image = symbols.get(number)
        return (
          <li key={number}>
            <button
              type="button"
              className="legend-entry"
              aria-pressed={highlighted === number}
              aria-label={`${threads}, ${stitchesLeft[i]} left`}
              onClick={() => onHighlight(highlighted === number ? undefined : number)}
            >
              <span className="legend-symbol" aria-hidden="true">
                {image ? <SymbolCanvas symbol={image.black} /> : fallbackSymbol(number)}
              </span>
              <span className="legend-swatch" style={{ background: entry.color ?? 'transparent' }} aria-hidden="true" />
              <span className="legend-threads">
                {threads}
                {names && <span className="legend-names"> {names}</span>}
              </span>
              <span className="legend-left">{stitchesLeft[i]} left</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** How many pixels across the panel draws a symbol, before the screen's pixel ratio. */
const SYMBOL_SIZE = 18

/** A cut symbol drawn on a small canvas. Not an image, since the Content Security Policy refuses `data:` URLs. */
function SymbolCanvas({ symbol }: { symbol: HTMLCanvasElement }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current!
    const pixels = Math.round(SYMBOL_SIZE * window.devicePixelRatio)
    element.width = pixels
    element.height = pixels
    element.getContext('2d')?.drawImage(symbol, 0, 0, pixels, pixels)
  }, [symbol])
  return <canvas ref={canvas} />
}
