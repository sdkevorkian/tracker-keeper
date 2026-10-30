// Reading the charts out of a PDF, the part of import that is slow. The
// Workspace is given one of these, so the app can run it in a Web Worker
// while tests run it in-process.
import { extractPages } from './extract.ts'
import { parseCharts, type ParsedChart } from './parse.ts'

export type ReadCharts = (bytes: Uint8Array) => Promise<ParsedChart[]>

export const readChartsInProcess: ReadCharts = async (bytes) => parseCharts(await extractPages(bytes))
