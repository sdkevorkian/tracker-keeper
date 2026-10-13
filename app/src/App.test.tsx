import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function openIn(browser: { userAgentData?: { brands: { brand: string; version: string }[] } }) {
  vi.stubGlobal('navigator', browser)
  render(<App />)
}

test('a stitcher on Firefox is told to use Chrome or Edge', () => {
  openIn({})

  expect(screen.getByRole('alert').textContent).toMatch(/use Chrome or Edge/i)
})

test('a stitcher on Chrome sees no browser notice', () => {
  openIn({
    userAgentData: {
      brands: [
        { brand: 'Chromium', version: '141' },
        { brand: 'Google Chrome', version: '141' },
      ],
    },
  })

  expect(screen.queryByRole('alert')).toBeNull()
})

test('a stitcher on Edge sees no browser notice', () => {
  openIn({
    userAgentData: {
      brands: [
        { brand: 'Chromium', version: '141' },
        { brand: 'Microsoft Edge', version: '141' },
      ],
    },
  })

  expect(screen.queryByRole('alert')).toBeNull()
})
