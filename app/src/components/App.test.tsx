import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App.tsx'
import { createWorkspace } from '../workspace/workspace.ts'
import { readChartsInProcess, type ReadCharts } from '../workspace/import/readCharts.ts'
import { buildChartPdf } from '../../tests/support/chartPdf.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

function openIn(
  browser: { userAgentData?: { brands: { brand: string; version: string }[] } },
  readCharts: ReadCharts = readChartsInProcess,
) {
  vi.stubGlobal('navigator', browser)
  render(<App workspace={createWorkspace({ readCharts })} />)
}

/** A one-row chart PDF of `width` stitches. */
function chartFile(width: number) {
  const pdf = buildChartPdf({
    fonts: { StitchSymbols: { glyphs: { 0x41: 'square' } } },
    symbols: { '#': { font: 'StitchSymbols', code: 0x41 } },
    pages: [
      { type: 'chart', cell: { width: 10, height: 10 }, grid: ['#'.repeat(width)] },
      {
        type: 'legend',
        entries: [{ symbol: '#', thread: { brand: 'DMC', code: '310' }, name: 'Black', strands: 2, count: width }],
      },
    ],
  })
  return new File([pdf.slice()], 'chart.pdf', { type: 'application/pdf' })
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

test('while a chart imports, the stitcher sees it loading instead of the chart before it', async () => {
  // jsdom has no ResizeObserver, which the chart view watches its size with.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  // The second import waits until the test lets it finish.
  let finish = () => {}
  const held = new Promise<void>((resolve) => (finish = resolve))
  let imports = 0
  openIn({ userAgentData: { brands: [{ brand: 'Chromium', version: '141' }] } }, async (bytes, signal) => {
    if (++imports === 2) await held
    return readChartsInProcess(bytes, signal)
  })
  const pick = (file: File) => fireEvent.change(screen.getByLabelText('Chart PDF'), { target: { files: [file] } })

  pick(chartFile(2))
  await screen.findByRole('img', { name: /Chart, 2 by 1 stitches/ })

  pick(chartFile(3))
  expect((await screen.findByRole('status')).textContent).toMatch(/loading chart/i)
  expect(screen.queryByRole('img')).toBeNull()

  finish()
  await screen.findByRole('img', { name: /Chart, 3 by 1 stitches/ })
  expect(screen.queryByRole('status')).toBeNull()
})
