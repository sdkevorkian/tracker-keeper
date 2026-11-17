import { expect, test } from 'vitest'
import { fallbackSymbol } from './fallbackSymbol.ts'

test('every legend entry of a large legend gets a built-in symbol of its own', () => {
  const entries = Array.from({ length: 100 }, (_, i) => i + 1)
  const symbols = entries.map(fallbackSymbol)

  expect(new Set(symbols).size).toBe(100)
  for (const symbol of symbols) expect([...symbol]).toHaveLength(1)
})

test('a legend entry always gets the same built-in symbol', () => {
  expect(fallbackSymbol(7)).toBe(fallbackSymbol(7))
})
