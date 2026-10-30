import { expect, test } from 'vitest'
import { panBy, visibleCells, zoomAt } from './viewport.ts'

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
