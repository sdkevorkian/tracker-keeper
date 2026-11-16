import { expect, test } from 'vitest'
import type { LegendEntry } from '../workspace/chart.ts'
import { cellLook } from './cellLook.ts'

const entry = (color?: string): LegendEntry => ({
  symbol: { font: 'StitchSymbols', code: 0x41 },
  threads: [{ brand: 'DMC', code: '310' }],
  color,
})
const zoomedIn = { symbols: true, gridLines: true }

test("color with symbols fills a cell with its thread's color and draws the symbol where it stands out", () => {
  expect(cellLook(entry('#000000'), 'color with symbols', zoomedIn)).toEqual({ fill: '#000000', symbol: '#ffffff' })
  expect(cellLook(entry('#f0e68c'), 'color with symbols', zoomedIn)).toEqual({ fill: '#f0e68c', symbol: '#000000' })
})

test("color blocks fill a cell with its thread's color and draw no symbol, however far zoomed in", () => {
  expect(cellLook(entry('#000000'), 'color blocks', zoomedIn)).toEqual({ fill: '#000000' })
})

test('symbols only draws black symbols on white, like a chart printed in black and white', () => {
  expect(cellLook(entry('#000000'), 'symbols only', zoomedIn)).toEqual({ fill: '#ffffff', symbol: '#000000' })
})

test('zoomed out too far to read symbols, every display style shows color, so the chart is still recognisable', () => {
  const zoomedOut = { symbols: false, gridLines: false }
  for (const style of ['symbols only', 'color blocks', 'color with symbols'] as const) {
    expect(cellLook(entry('#000000'), style, zoomedOut)).toEqual({ fill: '#000000' })
  }
})

test('a blank cell is white with no symbol in every display style', () => {
  for (const style of ['symbols only', 'color blocks', 'color with symbols'] as const) {
    expect(cellLook(undefined, style, zoomedIn)).toEqual({ fill: '#ffffff' })
  }
})

test('a legend entry with no known color is light grey, so it never looks like a blank cell', () => {
  expect(cellLook(entry(undefined), 'color with symbols', zoomedIn)).toEqual({ fill: '#d9d9d9', symbol: '#000000' })
  expect(cellLook(entry(undefined), 'color blocks', zoomedIn)).toEqual({ fill: '#d9d9d9' })
})
