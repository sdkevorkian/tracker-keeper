// @vitest-environment node
// Import refuses files it can't safely read, rather than hanging or crashing the app.
import { expect, test, vi } from 'vitest'
import { createWorkspace } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import { buildChartPdf, type PageDescription } from '../support/chartPdf.ts'

test('a file that is not a PDF is refused', async () => {
  const workspace = createWorkspace({ readCharts: readChartsInProcess })

  await expect(workspace.importPdf(new TextEncoder().encode('<html>not a chart</html>'))).rejects.toThrow(
    "This file isn't a PDF",
  )
})

test('a PDF over 200 MB is refused before it is read', async () => {
  const readCharts = vi.fn(readChartsInProcess)
  const workspace = createWorkspace({ readCharts })
  const pdf = new Uint8Array(200 * 1024 * 1024 + 1)
  pdf.set(new TextEncoder().encode('%PDF-1.7\n'))

  await expect(workspace.importPdf(pdf)).rejects.toThrow('This PDF is too large to import (over 200 MB)')
  expect(readCharts).not.toHaveBeenCalled()
})

test('a PDF with more than 500 pages is refused', async () => {
  const workspace = createWorkspace({ readCharts: readChartsInProcess })
  const pages: PageDescription[] = Array.from({ length: 501 }, (_, page) => ({
    type: 'text',
    lines: [`Page ${page + 1}`],
  }))

  await expect(workspace.importPdf(buildChartPdf({ fonts: {}, symbols: {}, pages }))).rejects.toThrow(
    'This PDF has too many pages to import (over 500)',
  )
})

test('an import still reading after a minute is stopped', async () => {
  vi.useFakeTimers()
  let readerSignal: AbortSignal | undefined
  // Stands in for a PDF that keeps pdf.js busy forever.
  const workspace = createWorkspace({
    readCharts: (_bytes, signal) => {
      readerSignal = signal
      return new Promise(() => {})
    },
  })

  const importing = expect(workspace.importPdf(new TextEncoder().encode('%PDF-1.7\n'))).rejects.toThrow(
    'This PDF took too long to read',
  )
  await vi.advanceTimersByTimeAsync(60_000)

  await importing
  expect(readerSignal?.aborted).toBe(true)
  vi.useRealTimers()
})
