// The Web Worker that reads charts, so a large PDF doesn't freeze the page.
import { GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { readChartsInProcess } from './readCharts.ts'

export type ReadChartsRequest = { id: number; bytes: Uint8Array }
export type ReadChartsResponse = { id: number } & ({ charts: Awaited<ReturnType<typeof readChartsInProcess>> } | { error: string })

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

self.onmessage = async ({ data: { id, bytes } }: MessageEvent<ReadChartsRequest>) => {
  let response: ReadChartsResponse
  try {
    response = { id, charts: await readChartsInProcess(bytes) }
  } catch (error) {
    response = { id, error: error instanceof Error ? error.message : String(error) }
  }
  self.postMessage(response)
}
