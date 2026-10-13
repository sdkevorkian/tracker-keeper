import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
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

test('a stitcher can switch the palette to dark mode and back', () => {
  openIn({})

  fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
  expect(document.documentElement.dataset.theme).toBe('dark')

  fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
  expect(document.documentElement.dataset.theme).toBe('light')
})
