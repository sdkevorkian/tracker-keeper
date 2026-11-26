import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { cellAt, cellsBetween, cursorForKey, viewportShowing, type CellPosition } from '../view/cells.ts'
import { drawChart } from '../view/draw.ts'
import { loadCursor, loadView, saveCursor, saveView } from '../view/savedView.ts'
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
} from '../view/viewport.ts'
import type { Chart } from '../workspace/chart.ts'
import { DISPLAY_STYLES, DONE, NOT_DONE, type DisplayStyle } from '../workspace/project.ts'
import { stitchesLeft } from '../workspace/workspace.ts'
import { isTextField } from './shortcuts.ts'
import { LegendPanel, threadsOf } from './LegendPanel.tsx'

/** Drawn while symbols are being cut from the source PDF: every entry's built-in symbol. */
const NO_SYMBOL_IMAGES: SymbolImages = new Map()

/** What the chart view needs to mark stitches in a project. */
export interface Marking {
  fabricColor: string
  /** The color done stitches are marked in. */
  doneColor: string
  /** One state per cell, as in a project's progress. */
  progress: Uint8Array
  /** Marks cells, as indexes into the chart's cells, done or not done, as one step to undo. */
  onMark: (cells: number[], done: boolean) => void
}

/** What a drag on the chart does in a project: marks the stitches it crosses, or pans the view. */
type PointerMode = 'mark' | 'pan'

/** A drag marking stitches, not yet made a mark: whether it marks them done, and the cells crossed so far. */
interface MarkDrag {
  done: boolean
  cells: CellPosition[]
}

interface ChartViewProps {
  chart: Chart
  /** Reads the chart's source PDF, to cut its symbols from. */
  sourcePdf: () => Promise<Uint8Array>
  /** Opens the source PDF at the page covering the view, or at its start when no page does. */
  onViewSourcePdf: (page: number | undefined) => void
  /** In a project, how stitches are marked. Without it the chart is only viewed. */
  marking?: Marking
  /** What the view is saved under, so reopening this page shows the chart zoomed and panned as it was. */
  viewKey: string
  /** How the chart is drawn, and switching it. */
  displayStyle: DisplayStyle
  onDisplayStyle: (style: DisplayStyle) => void
}

/** Where a pointer is on the canvas, in canvas pixels. */
function canvasPoint(event: PointerEvent<HTMLCanvasElement>): Point {
  const box = event.currentTarget.getBoundingClientRect()
  return { x: event.clientX - box.left, y: event.clientY - box.top }
}

function sameCell(a: CellPosition, b: CellPosition) {
  return a.column === b.column && a.row === b.row
}

/**
 * The chart on a canvas, panned by dragging, scrolling and the keyboard, and zoomed by pinching, the buttons and the keyboard.
 * In a project, a click or drag marks stitches instead of panning, until the stitcher switches to Pan, and the
 * arrow keys move a cell cursor that the keyboard marks with.
 */
export function ChartView({
  chart,
  sourcePdf,
  onViewSourcePdf,
  marking,
  viewKey,
  displayStyle: style,
  onDisplayStyle,
}: ChartViewProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  // Undefined until the stitcher pans or zooms, unless this page saved a view; until then the whole chart is fitted to the canvas.
  const [movedViewport, setViewport] = useState(() => loadView(viewKey))
  const viewport = movedViewport ?? fitChart(size, chart)
  // Each finger or mouse button down on the chart, where it last was in canvas pixels. One drags; two pinch.
  const pointers = useRef(new Map<number, Point>())
  // The legend entry highlighted, numbered from 1 as in the chart's cells. Only while the page is open.
  const [highlighted, setHighlighted] = useState<number>()
  // Undefined while they're being cut.
  const [symbols, setSymbols] = useState<SymbolImages>()
  const [pointerMode, setPointerMode] = useState<PointerMode>('mark')
  const [cursor, setCursor] = useState<CellPosition>(() => loadCursor(viewKey, chart) ?? { column: 0, row: 0 })
  // Drawn from state, but read by the pointer handlers from the ref, since a quick click's
  // pointerup can arrive before React re-renders with its pointerdown's drag.
  const [markDrag, setMarkDragState] = useState<MarkDrag>()
  const markDragRef = useRef<MarkDrag>(undefined)
  const setMarkDrag = (drag: MarkDrag | undefined) => {
    markDragRef.current = drag
    setMarkDragState(drag)
  }
  const marks = marking !== undefined && pointerMode === 'mark'
  const chartWidth = chart.width
  const indexOf = ({ column, row }: CellPosition) => row * chartWidth + column

  // The progress drawn: the project's, with a drag's stitches shown marked before the drag ends.
  const progress = marking?.progress
  const shownProgress = useMemo(() => {
    if (!progress || !markDrag) return progress
    const shown = progress.slice()
    for (const { column, row } of markDrag.cells) shown[row * chartWidth + column] = markDrag.done ? DONE : NOT_DONE
    return shown
  }, [progress, markDrag, chartWidth])
  const fabricColor = marking?.fabricColor
  const doneColor = marking?.doneColor
  const entriesLeft = useMemo(() => (progress ? stitchesLeft(chart, { progress }) : undefined), [chart, progress])

  // Escape clears the highlight from anywhere on the page but a text field or an open dialog, which have their own.
  useEffect(() => {
    if (highlighted === undefined) return
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || isTextField(event.target) || document.querySelector('dialog[open]')) return
      setHighlighted(undefined)
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [highlighted])

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

  // Saved on every change, which is cheap, so a reload straight after panning or moving the cursor still finds them.
  useEffect(() => saveView(viewKey, movedViewport), [viewKey, movedViewport])
  useEffect(() => {
    if (marking) saveCursor(viewKey, cursor)
  }, [viewKey, cursor, marking])

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
    const project =
      shownProgress && fabricColor !== undefined && doneColor !== undefined
        ? { progress: shownProgress, fabricColor, doneColor, cursor, highlighted }
        : undefined
    drawChart(context, chart, viewport, size, style, symbols ?? NO_SYMBOL_IMAGES, project)
  }, [chart, viewport, size, style, symbols, shownProgress, fabricColor, doneColor, cursor, highlighted])

  /** Moves the cell cursor, scrolling the view to keep it in sight. */
  function moveCursor(to: CellPosition) {
    setCursor(to)
    setViewport(viewportShowing(viewport, to, size))
  }

  function onKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    if (marking && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const next = cursorForKey(cursor, event.key, chart)
      if (next) {
        event.preventDefault()
        // With Shift, the stitches the cursor leaves and enters are marked done, a run as it goes.
        if (event.shiftKey) marking.onMark([indexOf(cursor), indexOf(next)], true)
        moveCursor(next)
        return
      }
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        marking.onMark([indexOf(cursor)], marking.progress[indexOf(cursor)] !== DONE)
        return
      }
    }
    const moved = viewportForKey(viewport, event, size, chart)
    if (!moved) return
    event.preventDefault()
    setViewport(moved)
  }

  const centre = centreOf(size)

  const { left, top, right, bottom } = visibleCells(viewport, size, chart)
  const symbolsShown = symbols
    ? `${symbols.size} symbols as printed and ${chart.legend.length - symbols.size} built in`
    : 'symbols loading'
  const cursorShown = marking ? `, cursor on stitch ${cursor.column + 1} across and ${cursor.row + 1} down` : ''
  const highlightShown =
    highlighted === undefined ? '' : `, highlighting ${threadsOf(chart.legend[highlighted - 1])}, others dimmed`
  const label =
    `Chart, ${chart.width} by ${chart.height} stitches, in ${style}, ` +
    `showing stitches ${left + 1} to ${right} across and ${top + 1} to ${bottom} down, ${symbolsShown}${cursorShown}${highlightShown}`

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
        {marking && (
          <fieldset className="display-styles">
            <legend>Drag to</legend>
            {(['mark', 'pan'] as const).map((option) => (
              <label key={option}>
                <input
                  type="radio"
                  name="pointer-mode"
                  value={option}
                  checked={pointerMode === option}
                  onChange={() => setPointerMode(option)}
                />
                {option === 'mark' ? 'Mark' : 'Pan'}
              </label>
            ))}
          </fieldset>
        )}
        <fieldset className="display-styles">
          <legend>Display style</legend>
          {DISPLAY_STYLES.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name="display-style"
                value={option}
                checked={style === option}
                onChange={() => onDisplayStyle(option)}
              />
              {option[0].toUpperCase() + option.slice(1)}
            </label>
          ))}
        </fieldset>
      </div>
      {marking && entriesLeft && (
        <LegendPanel
          legend={chart.legend}
          stitchesLeft={entriesLeft}
          symbols={symbols ?? NO_SYMBOL_IMAGES}
          highlighted={highlighted}
          onHighlight={setHighlighted}
        />
      )}
      <canvas
        ref={canvas}
        className={marks ? 'chart-view chart-view-marking' : 'chart-view'}
        role="img"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          pointers.current.set(event.pointerId, canvasPoint(event))
          if (pointers.current.size > 1) {
            // A second finger pinches, so the first finger's marks are dropped.
            setMarkDrag(undefined)
            return
          }
          if (!marks || event.button !== 0) return
          const cell = cellAt(viewport, canvasPoint(event), chart)
          if (!cell) return
          setCursor(cell)
          setMarkDrag({ done: marking.progress[indexOf(cell)] !== DONE, cells: [cell] })
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
          } else if (markDragRef.current) {
            const drag = markDragRef.current
            const cell = cellAt(viewport, canvasPoint(event), chart)
            const end = drag.cells.at(-1)!
            if (!cell || sameCell(cell, end)) return
            setCursor(cell)
            setMarkDrag({ ...drag, cells: [...drag.cells, ...cellsBetween(end, cell).slice(1)] })
          } else if (!marks) {
            const now = canvasPoint(event)
            setViewport((current) => panBy(current ?? viewport, { x: now.x - last.x, y: now.y - last.y }))
          }
        }}
        onPointerUp={(event) => {
          pointers.current.delete(event.pointerId)
          const drag = markDragRef.current
          if (!drag) return
          setMarkDrag(undefined)
          marking?.onMark(drag.cells.map(indexOf), drag.done)
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId)
          setMarkDrag(undefined)
        }}
      />
    </>
  )
}
