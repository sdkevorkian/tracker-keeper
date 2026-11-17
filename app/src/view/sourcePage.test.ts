import { expect, test } from 'vitest'
import type { SourcePage } from '../workspace/chart.ts'
import { pageForView } from './sourcePage.ts'

// A 60 × 40 chart printed on four pages, two across and two down, each repeating
// two rows and columns from the page before.
const pages: SourcePage[] = [
  { page: 3, across: [1, 31], down: [1, 21] },
  { page: 4, across: [30, 60], down: [1, 21] },
  { page: 5, across: [1, 31], down: [20, 40] },
  { page: 6, across: [30, 60], down: [20, 40] },
]
const canvas = { width: 200, height: 100 }

test('the page covering the middle of the view is the one to open', () => {
  // At 10 pixels a stitch the view is 20 × 10 stitches, so its middle is stitch 46 across and 26 down.
  expect(pageForView({ x: 35, y: 20, cellSize: 10 }, canvas, pages)).toBe(6)
})

test('where neighbouring pages repeat stitches, the first page printing them is opened', () => {
  // The middle is stitch 31 across and 21 down, which pages 3, 4, 5 and 6 all print.
  expect(pageForView({ x: 20, y: 15, cellSize: 10 }, canvas, pages)).toBe(3)
})

test('with the middle of the view off the chart, the nearest page is opened', () => {
  // The middle is 10 stitches beyond the chart's right edge, level with row 5.
  expect(pageForView({ x: 60, y: 0, cellSize: 10 }, canvas, pages)).toBe(4)
})
