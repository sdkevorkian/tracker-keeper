import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App.tsx'
import { createWorkspace } from '../workspace/workspace.ts'
import { readChartsInProcess } from '../workspace/import/readCharts.ts'
import { buildChartPdf } from '../../tests/support/chartPdf.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

function openIn(browser: { userAgentData?: { brands: { brand: string; version: string }[] } }) {
  vi.stubGlobal('navigator', browser)
  render(<App workspace={createWorkspace({ readCharts: readChartsInProcess })} />)
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

test('a stitcher can switch the theme to dark mode and back', () => {
  openIn({})

  fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
  expect(document.documentElement.dataset.theme).toBe('dark')

  fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
  expect(document.documentElement.dataset.theme).toBe('light')
})

test('a stitcher who picks a PDF with no chart in it is told so', async () => {
  openIn({ userAgentData: { brands: [{ brand: 'Chromium', version: '141' }] } })
  const pdf = buildChartPdf({
    fonts: {},
    symbols: {},
    pages: [{ type: 'text', lines: ['How to stitch', 'Use two strands'] }],
  })

  fireEvent.change(screen.getByLabelText('Chart PDF'), {
    target: { files: [new File([pdf.slice()], 'instructions.pdf', { type: 'application/pdf' })] },
  })

  expect((await screen.findByRole('alert')).textContent).toMatch(/no chart/i)
})
