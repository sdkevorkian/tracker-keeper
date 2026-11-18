import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { DisplayStyle } from '../view/cellLook.ts'
import { drawChart } from '../view/draw.ts'
import { pageForView } from '../view/sourcePage.ts'
import { cutSymbolImages, type SymbolImages } from '../view/symbolImages.ts'
import {
  centreOf,
  fitChart,
  panBy,
  viewportForKey,
  viewportForPinch,
  viewportForWheel,
  visibleCells,
  zoomAt,
  ZOOM_STEP,
  type Point,
  type Size,
  type Viewport,
} from '../view/viewport.ts'
import type { Chart } from '../workspace/chart.ts'

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

/** Where a pointer is on the canvas, in canvas pixels. */
function canvasPoint(event: PointerEvent<HTMLCanvasElement>): Point {
  const box = event.currentTarget.getBoundingClientRect()
  return { x: event.clientX - box.left, y: event.clientY - box.top }
}

/** The chart on a canvas, panned by dragging, scrolling and the keyboard, and zoomed by pinching, the buttons and the keyboard. */
export function ChartView({ chart, sourcePdf, onViewSourcePdf }: ChartViewProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  // Undefined until the stitcher pans or zooms; until then the whole chart is fitted to the canvas.
  const [movedViewport, setViewport] = useState<Viewport>()
  const viewport = movedViewport ?? fitChart(size, chart)
  // Each finger or mouse button down on the chart, where it last was in canvas pixels. One drags; two pinch.
  const pointers = useRef(new Map<number, Point>())
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
      const { deltaX, deltaY, shiftKey, ctrlKey } = event
      const point = { x: event.offsetX, y: event.offsetY }
      const fitted = () => fitChart({ width: element.clientWidth, height: element.clientHeight }, chart)
      setViewport((current) => viewportForWheel(current ?? fitted(), { deltaX, deltaY, shiftKey, ctrlKey, point }))
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

  const centre = centreOf(size)

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
        <button type="button" className="button" onClick={() => setViewport(zoomAt(viewport, ZOOM_STEP, centre))}>
          Zoom in
        </button>
        <button type="button" className="button" onClick={() => setViewport(zoomAt(viewport, 1 / ZOOM_STEP, centre))}>
          Zoom out
        </button>
        <button type="button" className="button" onClick={() => setViewport(undefined)}>
          Fit
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
        tabIndex={0}
        onKeyDown={(event) => {
          const moved = viewportForKey(viewport, event, size, chart)
          if (!moved) return
          event.preventDefault()
          setViewport(moved)
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          pointers.current.set(event.pointerId, canvasPoint(event))
        }}
        onPointerMove={(event) => {
          const last = pointers.current.get(event.pointerId)
          if (!last) return
          const before = [...pointers.current.values()]
          pointers.current.set(event.pointerId, canvasPoint(event))
          const after = [...pointers.current.values()]
          if (before.length === 2) {
            setViewport((current) =>
              viewportForPinch(current ?? viewport, [before[0], before[1]], [after[0], after[1]]),
            )
          } else {
            const now = canvasPoint(event)
            setViewport((current) => panBy(current ?? viewport, { x: now.x - last.x, y: now.y - last.y }))
          }
        }}
        onPointerUp={(event) => pointers.current.delete(event.pointerId)}
        onPointerCancel={(event) => pointers.current.delete(event.pointerId)}
      />
    </>
  )
}
