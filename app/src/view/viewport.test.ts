import { expect, test } from 'vitest'
import { fitChart, panBy, visibleCells, zoomAt } from './viewport.ts'

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
