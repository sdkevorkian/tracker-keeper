import { expect, test } from 'vitest'
import { maskFromPixels } from './symbolMask.ts'

const WHITE = [255, 255, 255, 255]
const BLACK = [0, 0, 0, 255]
const RED = [199, 43, 59, 255]
const GREY = [128, 128, 128, 255]

/** A cell's pixels, row by row, as a canvas gives them. */
function pixels(rows: number[][][]) {
  return { data: new Uint8ClampedArray(rows.flat(2)), width: rows[0].length, height: rows.length }
}

/** A 3 × 3 cell printed in one color throughout. */
function plain(color: number[]) {
  return pixels(Array.from({ length: 3 }, () => [color, color, color]))
}

test('a symbol printed on white becomes ink where it is printed and nothing elsewhere', () => {
  const printed = pixels([
    [WHITE, WHITE, WHITE],
    [WHITE, BLACK, WHITE],
    [WHITE, WHITE, WHITE],
  ])

  expect([...maskFromPixels(printed, plain(WHITE))]).toEqual([0, 0, 0, 0, 255, 0, 0, 0, 0])
})

test("a symbol printed on its thread's color is full ink however close the color is to the symbol's", () => {
  const printed = pixels([
    [RED, RED, RED],
    [RED, BLACK, RED],
    [RED, RED, RED],
  ])

  expect([...maskFromPixels(printed, plain(RED))]).toEqual([0, 0, 0, 0, 255, 0, 0, 0, 0])
})

test('a symbol that fills the whole cell is ink throughout', () => {
  expect([...maskFromPixels(plain(BLACK), plain(WHITE))]).toEqual(Array(9).fill(255))
})

test('a grid line the cell prints without its symbol too is not part of the symbol', () => {
  const background = pixels([
    [GREY, WHITE, WHITE],
    [GREY, WHITE, WHITE],
    [GREY, WHITE, WHITE],
  ])
  const printed = pixels([
    [GREY, WHITE, WHITE],
    [GREY, BLACK, WHITE],
    [GREY, WHITE, WHITE],
  ])

  expect([...maskFromPixels(printed, background)]).toEqual([0, 0, 0, 0, 255, 0, 0, 0, 0])
})

test("a symbol's softened edge, halfway between ink and background, is half ink", () => {
  const printed = pixels([
    [WHITE, WHITE, WHITE],
    [WHITE, BLACK, GREY],
    [WHITE, WHITE, WHITE],
  ])

  expect([...maskFromPixels(printed, plain(WHITE))]).toEqual([0, 0, 0, 0, 255, 127, 0, 0, 0])
})
