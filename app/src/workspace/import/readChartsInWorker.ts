// Reads charts in a Web Worker. Browser only.
import type { ReadCharts } from './readCharts.ts'
import type { ParsedChart } from './parse.ts'
import type { ReadChartsRequest, ReadChartsResponse } from './readChartsWorker.ts'

interface Pending {
  resolve: (charts: ParsedChart[]) => void
  reject: (error: Error) => void
}

export function readChartsInWorker(): ReadCharts {
  let worker: Worker | undefined
  const pending = new Map<number, Pending>()
  let nextId = 0

  const start = () => {
    const started = new Worker(new URL('./readChartsWorker.ts', import.meta.url), { type: 'module' })
    started.onmessage = ({ data }: MessageEvent<ReadChartsResponse>) => {
      const request = pending.get(data.id)
      pending.delete(data.id)
      if ('error' in data) request?.reject(new Error(data.error))
      else request?.resolve(data.charts)
    }
    return started
  }

  // A worker stuck on a PDF can't be interrupted, only replaced.
  const stop = (reason: Error) => {
    worker?.terminate()
    worker = undefined
    for (const request of pending.values()) request.reject(reason)
    pending.clear()
  }

  return (bytes, signal) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      signal.addEventListener('abort', () => stop(new Error('Reading the PDF was stopped')), { once: true })
      worker ??= start()
      const message: ReadChartsRequest = { id, bytes: bytes.slice() }
      worker.postMessage(message, [message.bytes.buffer])
    })
}
