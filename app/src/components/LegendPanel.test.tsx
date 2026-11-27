import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import type { DisplayStyle } from '../view/cellLook.ts'
import { fallbackSymbol } from '../view/fallbackSymbol.ts'
import type { LegendEntry } from '../workspace/chart.ts'
import { LegendPanel } from './LegendPanel.tsx'

afterEach(cleanup)

const entry = (code: string, color: string): LegendEntry => ({
  symbol: { font: 'StitchSymbols', code: 0x41 },
  threads: [{ brand: 'DMC', code }],
  color,
})
/** A dark thread and a light one, so the symbol's ink differs between them. */
const legend = [entry('310', '#000000'), entry('677', '#f0e68c')]

/** Each entry's cell as the panel draws it, with no symbols cut from a PDF so the built-in ones show. */
function cellsIn(style: DisplayStyle) {
  render(<LegendPanel legend={legend} stitchesLeft={[5, 3]} symbols={new Map()} style={style} onHighlight={() => {}} />)
  return ['DMC 310, 5 left', 'DMC 677, 3 left'].map((name) => {
    const cell = screen.getByRole('button', { name }).querySelector<HTMLElement>('.legend-cell')!
    return { fill: cell.style.background, ink: cell.style.color, symbol: cell.textContent }
  })
}

test("in color with symbols, each entry's cell is its thread's color with its symbol in the ink that stands out", () => {
  expect(cellsIn('color with symbols')).toEqual([
    { fill: 'rgb(0, 0, 0)', ink: 'rgb(255, 255, 255)', symbol: fallbackSymbol(1) },
    { fill: 'rgb(240, 230, 140)', ink: 'rgb(0, 0, 0)', symbol: fallbackSymbol(2) },
  ])
})

test("in symbols only, each entry's cell is a black symbol on white", () => {
  expect(cellsIn('symbols only')).toEqual([
    { fill: 'rgb(255, 255, 255)', ink: 'rgb(0, 0, 0)', symbol: fallbackSymbol(1) },
    { fill: 'rgb(255, 255, 255)', ink: 'rgb(0, 0, 0)', symbol: fallbackSymbol(2) },
  ])
})

test("in color blocks, each entry's cell is its thread's color with no symbol", () => {
  expect(cellsIn('color blocks')).toEqual([
    { fill: 'rgb(0, 0, 0)', ink: '', symbol: '' },
    { fill: 'rgb(240, 230, 140)', ink: '', symbol: '' },
  ])
})
