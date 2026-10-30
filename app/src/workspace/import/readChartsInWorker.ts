// Reads charts in a Web Worker. Browser only.
import type { ReadCharts } from './readCharts.ts'
import type { ParsedChart } from './parse.ts'
import type { ReadChartsRequest, ReadChartsResponse } from './readChartsWorker.ts'

export function readChartsInWorker(): ReadCharts {
  const worker = new Worker(new URL('./readChartsWorker.ts', import.meta.url), { type: 'module' })
  const pending = new Map<number, { resolve: (charts: ParsedChart[]) => void; reject: (error: Error) => void }>()
  let nextId = 0

  worker.onmessage = ({ data }: MessageEvent<ReadChartsResponse>) => {
    const request = pending.get(data.id)
    pending.delete(data.id)
    if ('error' in data) request?.reject(new Error(data.error))
    else request?.resolve(data.charts)
  }

  return (bytes) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      const message: ReadChartsRequest = { id, bytes: bytes.slice() }
      worker.postMessage(message, [message.bytes.buffer])
    })
}
