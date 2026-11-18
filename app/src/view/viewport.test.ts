import { expect, test } from 'vitest'
import {
  fitChart,
  panBy,
  viewportForKey,
  viewportForPinch,
  viewportForWheel,
  visibleCells,
  zoomAt,
} from './viewport.ts'

const chart = { width: 300, height: 200 }
const canvas = { width: 100, height: 50 }

test('a viewport at the top left shows the cells that fit in the canvas', () => {
  expect(visibleCells({ x: 0, y: 0, cellSize: 10 }, canvas, chart)).toEqual({ left: 0, top: 0, right: 10, bottom: 5 })
})

test('only cells inside the chart are visible', () => {
  expect(visibleCells({ x: -2, y: 195.5, cellSize: 10 }, canvas, chart)).toEqual({
    left: 0,
    top: 195,
    right: 8,
    bottom: 200,
  })
})

test('zooming in keeps the stitch under the pointer where it is', () => {
  // The pointer is over stitch (15, 23): 5 stitches across and 3 down from (10, 20).
  expect(zoomAt({ x: 10, y: 20, cellSize: 10 }, 2, { x: 50, y: 30 })).toEqual({ x: 12.5, y: 21.5, cellSize: 20 })
})

test('zooming stops when a stitch is 80 pixels or 2 pixels across', () => {
  const pointer = { x: 0, y: 0 }
  expect(zoomAt({ x: 0, y: 0, cellSize: 40 }, 4, pointer).cellSize).toBe(80)
  expect(zoomAt({ x: 0, y: 0, cellSize: 4 }, 1 / 4, pointer).cellSize).toBe(2)
})

test('dragging moves the chart with the pointer', () => {
  // Dragging 30 pixels right and 20 up, at 10 pixels a stitch, brings stitches from the left and below into view.
  expect(panBy({ x: 10, y: 20, cellSize: 10 }, { x: 30, y: -20 })).toEqual({ x: 7, y: 22, cellSize: 10 })
})

test('a chart that fits opens as large as the canvas allows, centred', () => {
  // 300 × 200 stitches in a 600 × 600 canvas: the width limits it to 2 pixels a stitch, leaving 400 pixels below.
  expect(fitChart({ width: 600, height: 600 }, chart)).toEqual({ x: 0, y: -50, cellSize: 2 })
})

test('fitting keeps stitches between 2 and 80 pixels across', () => {
  const square = { width: 600, height: 600 }
  // A tiny chart stays centred at 80 pixels a stitch: 7.5 stitches fit across, 3 are used.
  expect(fitChart(square, { width: 3, height: 2 })).toEqual({ x: -2.25, y: -2.75, cellSize: 80 })
  // A chart too big to fit at 2 pixels a stitch opens at its top left.
  expect(fitChart(square, { width: 1000, height: 250 })).toEqual({ x: 0, y: -25, cellSize: 2 })
})

test('+ and = zoom in twofold about the middle of the canvas', () => {
  // The middle of the 100 × 50 canvas is over stitch (15, 22.5): 5 across and 2.5 down from (10, 20).
  const zoomed = { x: 12.5, y: 21.25, cellSize: 20 }
  expect(viewportForKey({ x: 10, y: 20, cellSize: 10 }, { key: '+' }, canvas, chart)).toEqual(zoomed)
  expect(viewportForKey({ x: 10, y: 20, cellSize: 10 }, { key: '=' }, canvas, chart)).toEqual(zoomed)
})

test('- zooms out twofold about the middle of the canvas', () => {
  // The middle of the 100 × 50 canvas is over stitch (15, 22.5), which stays there at 5 pixels a stitch.
  expect(viewportForKey({ x: 10, y: 20, cellSize: 10 }, { key: '-' }, canvas, chart)).toEqual({
    x: 5,
    y: 17.5,
    cellSize: 5,
  })
})

test('0 fits the whole chart again', () => {
  // 300 × 200 stitches can't fit a 100 × 50 canvas even at 2 pixels a stitch, so it fits from its top left.
  expect(viewportForKey({ x: 10, y: 20, cellSize: 10 }, { key: '0' }, canvas, chart)).toEqual({
    x: 0,
    y: 0,
    cellSize: 2,
  })
})

test('arrow keys pan 5 stitches, bringing stitches from that side into view', () => {
  const viewport = { x: 10, y: 20, cellSize: 10 }
  expect(viewportForKey(viewport, { key: 'ArrowRight' }, canvas, chart)).toEqual({ x: 15, y: 20, cellSize: 10 })
  expect(viewportForKey(viewport, { key: 'ArrowLeft' }, canvas, chart)).toEqual({ x: 5, y: 20, cellSize: 10 })
  expect(viewportForKey(viewport, { key: 'ArrowDown' }, canvas, chart)).toEqual({ x: 10, y: 25, cellSize: 10 })
  expect(viewportForKey(viewport, { key: 'ArrowUp' }, canvas, chart)).toEqual({ x: 10, y: 15, cellSize: 10 })
})

test('Shift + arrow keys pan by a screen', () => {
  // The 100 × 50 canvas shows 10 stitches across and 5 down at 10 pixels a stitch.
  const viewport = { x: 10, y: 20, cellSize: 10 }
  expect(viewportForKey(viewport, { key: 'ArrowRight', shiftKey: true }, canvas, chart)).toEqual({
    x: 20,
    y: 20,
    cellSize: 10,
  })
  expect(viewportForKey(viewport, { key: 'ArrowUp', shiftKey: true }, canvas, chart)).toEqual({
    x: 10,
    y: 15,
    cellSize: 10,
  })
})

test('keys held with Ctrl or ⌘ are left to the browser, such as its own page zoom', () => {
  const viewport = { x: 10, y: 20, cellSize: 10 }
  expect(viewportForKey(viewport, { key: '-', ctrlKey: true }, canvas, chart)).toBeUndefined()
  expect(viewportForKey(viewport, { key: '0', metaKey: true }, canvas, chart)).toBeUndefined()
})

test('scrolling with two fingers or the wheel pans the chart the way it scrolls', () => {
  // Scrolling 20 pixels right and 30 down, at 10 pixels a stitch, brings stitches from the right and below into view.
  const scrolled = viewportForWheel({ x: 10, y: 20, cellSize: 10 }, { deltaX: 20, deltaY: 30, point: { x: 0, y: 0 } })
  expect(scrolled).toEqual({ x: 12, y: 23, cellSize: 10 })
})

test('a pinch or Ctrl + wheel zooms about the pointer instead of panning', () => {
  // The pointer is over stitch (15, 23): 5 stitches across and 3 down from (10, 20).
  const point = { x: 50, y: 30 }
  const before = { x: 10, y: 20, cellSize: 10 }
  const pinchedOut = viewportForWheel(before, { deltaX: 0, deltaY: -100, ctrlKey: true, point })
  const pinchedIn = viewportForWheel(before, { deltaX: 0, deltaY: 100, ctrlKey: true, point })

  expect(pinchedOut.cellSize).toBeGreaterThan(10)
  expect(pinchedIn.cellSize).toBeLessThan(10)
  for (const after of [pinchedOut, pinchedIn]) {
    expect(after.x + point.x / after.cellSize).toBeCloseTo(15)
    expect(after.y + point.y / after.cellSize).toBeCloseTo(23)
  }
})

test('Shift + mouse wheel pans sideways', () => {
  const viewport = { x: 10, y: 20, cellSize: 10 }
  const point = { x: 0, y: 0 }
  // A mouse wheel turns only down; with Shift held, that brings stitches from the right into view.
  expect(viewportForWheel(viewport, { deltaX: 0, deltaY: 30, shiftKey: true, point })).toEqual({
    x: 13,
    y: 20,
    cellSize: 10,
  })
  // Where the browser has already turned it sideways, it isn't turned again.
  expect(viewportForWheel(viewport, { deltaX: 30, deltaY: 0, shiftKey: true, point })).toEqual({
    x: 13,
    y: 20,
    cellSize: 10,
  })
})

test('spreading two fingers zooms about the midpoint between them', () => {
  // The fingers' midpoint stays over stitch (15, 23) as they go from 40 to 80 pixels apart.
  const before = [
    { x: 30, y: 30 },
    { x: 70, y: 30 },
  ] as const
  const after = [
    { x: 10, y: 30 },
    { x: 90, y: 30 },
  ] as const
  expect(viewportForPinch({ x: 10, y: 20, cellSize: 10 }, before, after)).toEqual({ x: 12.5, y: 21.5, cellSize: 20 })
})

test('moving two fingers together pans the chart with them', () => {
  // Both fingers move 20 pixels right and 20 up, at 10 pixels a stitch, as a drag would.
  const before = [
    { x: 30, y: 30 },
    { x: 70, y: 30 },
  ] as const
  const after = [
    { x: 50, y: 10 },
    { x: 90, y: 10 },
  ] as const
  expect(viewportForPinch({ x: 10, y: 20, cellSize: 10 }, before, after)).toEqual({ x: 8, y: 22, cellSize: 10 })
})
