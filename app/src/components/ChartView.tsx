import { useEffect, useRef, useState } from 'react'
import type { DisplayStyle } from '../view/cellLook.ts'
import { drawChart } from '../view/draw.ts'
import { pageForView } from '../view/sourcePage.ts'
import { cutSymbolImages, type SymbolImages } from '../view/symbolImages.ts'
import { fitChart, panBy, visibleCells, zoomAt, type Size, type Viewport } from '../view/viewport.ts'
import type { Chart } from '../workspace/chart.ts'

/** How much one pixel of wheel scroll zooms. */
const WHEEL_ZOOM = 0.002

const DISPLAY_STYLES: DisplayStyle[] = ['symbols only', 'color blocks', 'color with symbols']

/** Drawn while symbols are being cut from the source PDF: every entry's built-in symbol. */
const NO_SYMBOL_IMAGES: SymbolImages = new Map()

interface ChartViewProps {
  chart: Chart
  /** Reads the chart's source PDF, to cut its symbols from. */
  sourcePdf: () => Promise<Uint8Array>
  /** Opens the source PDF at the page covering the view, or at its start when no page does. */
  onViewSourcePdf: (page: number | undefined) => void
}

/** The chart on a canvas, panned by dragging and zoomed with the wheel. */
export function ChartView({ chart, sourcePdf, onViewSourcePdf }: ChartViewProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  // Undefined until the stitcher pans or zooms; until then the whole chart is fitted to the canvas.
  const [movedViewport, setViewport] = useState<Viewport>()
  const viewport = movedViewport ?? fitChart(size, chart)
  const drag = useRef<{ x: number; y: number }>(undefined)
  // Kept per project once projects exist; for now each opening starts in color with symbols.
  const [style, setStyle] = useState<DisplayStyle>('color with symbols')
  // Undefined while they're being cut.
  const [symbols, setSymbols] = useState<SymbolImages>()

  // Cut each legend entry's symbol from the source PDF. If that fails, built-in symbols stand in for them all.
  // The chart view is keyed by chart, so this runs once per chart opened.
  useEffect(() => {
    let current = true
    sourcePdf()
      .then((pdf) => cutSymbolImages(pdf, chart.legend))
      .catch(() => NO_SYMBOL_IMAGES)
      .then((cut) => current && setSymbols(cut))
    return () => {
      current = false
    }
  }, [chart.legend, sourcePdf])

  // Keep the canvas's pixels matched to its CSS size.
  useEffect(() => {
    const element = canvas.current!
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // React's onWheel is passive, so it can't stop the page scrolling.
  useEffect(() => {
    const element = canvas.current!
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const point = { x: event.offsetX, y: event.offsetY }
      const fitted = () => fitChart({ width: element.clientWidth, height: element.clientHeight }, chart)
      setViewport((current) => zoomAt(current ?? fitted(), Math.exp(-event.deltaY * WHEEL_ZOOM), point))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [chart])

  useEffect(() => {
    const element = canvas.current!
    const scale = window.devicePixelRatio
    element.width = Math.round(size.width * scale)
    element.height = Math.round(size.height * scale)
    const context = element.getContext('2d')
    if (!context) return
    context.setTransform(scale, 0, 0, scale, 0, 0)
    drawChart(context, chart, viewport, size, style, symbols ?? NO_SYMBOL_IMAGES)
  }, [chart, viewport, size, style, symbols])

  const { left, top, right, bottom } = visibleCells(viewport, size, chart)
  const symbolsShown = symbols
    ? `${symbols.size} symbols as printed and ${chart.legend.length - symbols.size} built in`
    : 'symbols loading'
  const label =
    `Chart, ${chart.width} by ${chart.height} stitches, in ${style}, ` +
    `showing stitches ${left + 1} to ${right} across and ${top + 1} to ${bottom} down, ${symbolsShown}`

  return (
    <>
      <div className="chart-toolbar">
        <button
          type="button"
          className="button"
          onClick={() => onViewSourcePdf(pageForView(viewport, size, chart.source.pages))}
        >
          View source PDF
        </button>
        <fieldset className="display-styles">
          <legend>Display style</legend>
          {DISPLAY_STYLES.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name="display-style"
                value={option}
                checked={style === option}
                onChange={() => setStyle(option)}
              />
              {option[0].toUpperCase() + option.slice(1)}
            </label>
          ))}
        </fieldset>
      </div>
      <canvas
        ref={canvas}
        className="chart-view"
        role="img"
        aria-label={label}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { x: event.clientX, y: event.clientY }
        }}
        onPointerMove={(event) => {
          if (!drag.current) return
          const moved = { x: event.clientX - drag.current.x, y: event.clientY - drag.current.y }
          drag.current = { x: event.clientX, y: event.clientY }
          setViewport((current) => panBy(current ?? viewport, moved))
        }}
        onPointerUp={() => (drag.current = undefined)}
        onPointerCancel={() => (drag.current = undefined)}
      />
    </>
  )
}
