import { expect, test } from 'vitest'
import { detailAt, gridLineWeight } from './detail.ts'

test('zoomed out, only color shows', () => {
  expect(detailAt(9)).toEqual({ symbols: false, gridLines: false })
})

test('from 10 pixels a stitch, symbols show', () => {
  expect(detailAt(10)).toEqual({ symbols: true, gridLines: false })
  expect(detailAt(19)).toEqual({ symbols: true, gridLines: false })
})

test('from 20 pixels a stitch, grid lines show too', () => {
  expect(detailAt(20)).toEqual({ symbols: true, gridLines: true })
})

test("every 10th grid line, counted from the chart's edge, is thicker", () => {
  // Line n runs along the left or top of stitch n + 1, so lines 0, 10 and 20 bound blocks of 10 stitches.
  expect([0, 1, 9, 10, 11, 20, 25].map(gridLineWeight)).toEqual([
    'thick',
    'thin',
    'thin',
    'thick',
    'thin',
    'thick',
    'thin',
  ])
})
