// Reading the charts out of a PDF, the part of import that is slow. The
// Workspace is given one of these, so the app can run it in a Web Worker
// while tests run it in-process.
import { extractPdf } from './extract.ts'
import { parseCharts, type ParsedChart } from './parse.ts'

/** Reads the charts in a PDF. Once `signal` aborts, the result no longer matters and the work should stop. */
export type ReadCharts = (bytes: Uint8Array, signal: AbortSignal) => Promise<ParsedChart[]>

export const readChartsInProcess: ReadCharts = async (bytes, signal) => parseCharts(await extractPdf(bytes, signal))
