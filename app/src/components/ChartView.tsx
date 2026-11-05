import { useEffect, useRef, useState } from 'react'
import { drawChart } from '../view/draw.ts'
import { fitChart, panBy, visibleCells, zoomAt, type Size, type Viewport } from '../view/viewport.ts'
import type { Chart } from '../workspace/chart.ts'

/** How much one pixel of wheel scroll zooms. */
const WHEEL_ZOOM = 0.002

/** The chart on a canvas, panned by dragging and zoomed with the wheel. */
export function ChartView({ chart }: { chart: Chart }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  // Undefined until the stitcher pans or zooms; until then the whole chart is fitted to the canvas.
  const [movedViewport, setViewport] = useState<Viewport>()
  const viewport = movedViewport ?? fitChart(size, chart)
  const drag = useRef<{ x: number; y: number }>(undefined)

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
    drawChart(context, chart, viewport, size)
  }, [chart, viewport, size])

  const { left, top, right, bottom } = visibleCells(viewport, size, chart)
  const label =
    `Chart, ${chart.width} by ${chart.height} stitches, ` +
    `showing stitches ${left + 1} to ${right} across and ${top + 1} to ${bottom} down`

  return (
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
  )
}
