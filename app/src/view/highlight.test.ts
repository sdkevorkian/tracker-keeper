import { expect, test } from 'vitest'
import { dimmedCells } from './highlight.ts'

test("highlighting a legend entry dims every other entry's stitches, but not its own or blank cells", () => {
  // Entries are numbered from 1; 0 is a blank cell.
  const cells = new Uint16Array([1, 2, 0, 2, 3, 1])

  expect([...dimmedCells(cells, 2)]).toEqual([1, 0, 0, 0, 1, 1])
})
