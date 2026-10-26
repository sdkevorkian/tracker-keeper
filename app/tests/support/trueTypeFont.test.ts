// @vitest-environment node
import opentype from 'opentype.js'
import { expect, test } from 'vitest'
import { buildTrueTypeFont } from './trueTypeFont.ts'

function parse(bytes: Uint8Array) {
  return opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
}

// Symbol fonts map each character code into the U+F0xx block of their (3,0) cmap.
function glyphAt(font: opentype.Font, code: number) {
  const index = (font.tables.cmap as unknown as { glyphIndexMap: Record<number, number> }).glyphIndexMap[
    0xf000 + code
  ]
  return index === undefined ? undefined : font.glyphs.get(index)
}

function corners(glyph: opentype.Glyph) {
  const unique = new Set(
    glyph.path.commands
      .filter((command) => command.type === 'M' || command.type === 'L')
      .map((command) => `${(command as { x: number }).x},${(command as { y: number }).y}`),
  )
  return [...unique]
    .map((point) => point.split(',').map(Number))
    .sort(([ax, ay], [bx, by]) => ax - bx || ay - by)
}

test('a symbol font draws the chosen shape at the chosen character code', () => {
  const font = parse(buildTrueTypeFont({ glyphs: { 0x41: 'square' } }))

  expect(corners(glyphAt(font, 0x41)!)).toEqual([
    [100, 100],
    [100, 900],
    [900, 100],
    [900, 900],
  ])
})

test('two fonts can draw different symbols at the same character code', () => {
  const squares = parse(buildTrueTypeFont({ name: 'Squares', glyphs: { 0x41: 'square', 0x42: 'square' } }))
  const triangles = parse(buildTrueTypeFont({ name: 'Triangles', glyphs: { 0x41: 'triangle' } }))

  expect(squares.getEnglishName('postScriptName')).toBe('Squares')
  expect(triangles.getEnglishName('postScriptName')).toBe('Triangles')
  expect(corners(glyphAt(squares, 0x42)!)).toHaveLength(4)
  expect(corners(glyphAt(triangles, 0x41)!)).toEqual([
    [100, 100],
    [500, 900],
    [900, 100],
  ])
})
