import { expect, test } from 'vitest'
import { cellAt, cellsBetween, cursorForKey, viewportShowing } from './cells.ts'

const chart = { width: 4, height: 3 }

test('the cell under a point, with the view panned and zoomed', () => {
  // Stitch (1, 1) is at the canvas's top left, and each stitch is 10 pixels.
  const viewport = { x: 1, y: 1, cellSize: 10 }

  expect(cellAt(viewport, { x: 5, y: 5 }, chart)).toEqual({ column: 1, row: 1 })
  expect(cellAt(viewport, { x: 25, y: 12 }, chart)).toEqual({ column: 3, row: 2 })
})

test('no cell is under a point off the chart', () => {
  const viewport = { x: -1, y: 0, cellSize: 10 }

  expect(cellAt(viewport, { x: 5, y: 5 }, chart)).toBeUndefined()
  expect(cellAt(viewport, { x: 55, y: 5 }, chart)).toBeUndefined()
  expect(cellAt(viewport, { x: 15, y: 35 }, chart)).toBeUndefined()
})

test('a run between two cells takes in every cell between them, in order, so a fast drag skips none', () => {
  expect(cellsBetween({ column: 0, row: 1 }, { column: 3, row: 1 })).toEqual([
    { column: 0, row: 1 },
    { column: 1, row: 1 },
    { column: 2, row: 1 },
    { column: 3, row: 1 },
  ])
  expect(cellsBetween({ column: 2, row: 2 }, { column: 0, row: 0 })).toEqual([
    { column: 2, row: 2 },
    { column: 1, row: 1 },
    { column: 0, row: 0 },
  ])
  expect(cellsBetween({ column: 1, row: 0 }, { column: 1, row: 0 })).toEqual([{ column: 1, row: 0 }])
})

test('a run at a slope steps one cell at a time, from end to end, with no gaps', () => {
  const run = cellsBetween({ column: 0, row: 0 }, { column: 7, row: 3 })

  expect(run).toHaveLength(8)
  expect(run[0]).toEqual({ column: 0, row: 0 })
  expect(run.at(-1)).toEqual({ column: 7, row: 3 })
  for (let i = 1; i < run.length; i++) {
    expect(run[i].column - run[i - 1].column).toBe(1)
    expect([0, 1]).toContain(run[i].row - run[i - 1].row)
  }
})

test('the arrow keys move the cell cursor one cell, and stop at the chart’s edge', () => {
  expect(cursorForKey({ column: 1, row: 1 }, 'ArrowRight', chart)).toEqual({ column: 2, row: 1 })
  expect(cursorForKey({ column: 1, row: 1 }, 'ArrowUp', chart)).toEqual({ column: 1, row: 0 })
  expect(cursorForKey({ column: 3, row: 2 }, 'ArrowRight', chart)).toEqual({ column: 3, row: 2 })
  expect(cursorForKey({ column: 0, row: 0 }, 'ArrowLeft', chart)).toEqual({ column: 0, row: 0 })
})

test('other keys don’t move the cell cursor', () => {
  expect(cursorForKey({ column: 1, row: 1 }, 'a', chart)).toBeUndefined()
})

test('the view stays put while the cell cursor is in sight, and scrolls just enough to keep it there', () => {
  const canvas = { width: 40, height: 30 }
  const viewport = { x: 10, y: 10, cellSize: 10 }

  // Columns 10–13 and rows 10–12 are in sight.
  expect(viewportShowing(viewport, { column: 13, row: 12 }, canvas)).toBe(viewport)
  expect(viewportShowing(viewport, { column: 14, row: 11 }, canvas)).toEqual({ x: 11, y: 10, cellSize: 10 })
  expect(viewportShowing(viewport, { column: 9, row: 8 }, canvas)).toEqual({ x: 9, y: 8, cellSize: 10 })
})
