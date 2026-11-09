// Checks imports against a folder of real chart PDFs, each with its expected output
// stored next to it as <name>.expected.json.
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createWorkspace } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import type { Chart, ImportIssue } from '../../src/workspace/chart.ts'

/** What a source PDF imports as, in the form stored in its expected output. */
export interface ExpectedOutput {
  charts: ChartSummary[]
}

export interface ChartSummary {
  title?: string
  size: { width: number; height: number }
  legend: { symbol: Chart['legend'][number]['symbol']; threads: Chart['legend'][number]['threads']; stitches: number }[]
  importIssues: ImportIssueSummary[]
}

/** An import issue, with the number of cells it names in place of their list. */
export type ImportIssueSummary = {
  [Kind in ImportIssue['kind']]: Extract<ImportIssue, { kind: Kind }> extends infer Issue
    ? Issue extends { cells: number[] }
      ? Omit<Issue, 'cells'> & { cells: number }
      : Issue
    : never
}[ImportIssue['kind']]

export type ComparisonResult =
  | { pdf: string; outcome: 'matches' | 'no expected output' | 'updated' }
  | { pdf: string; outcome: 'differs'; differences: string[] }

export interface CompareOptions {
  /** Writes what each chart imports as its new expected output, in `folder`, instead of comparing. */
  update?: boolean
}

/** Compares, or with `update` records, every PDF in `folder`, in name order. */
export async function compareChartFolder(folder: string, options: CompareOptions = {}): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = []
  for (const pdf of await pdfsIn(folder)) results.push(await compareChart(folder, pdf, options))
  return results
}

async function pdfsIn(folder: string) {
  return (await readdir(folder)).filter((name) => name.toLowerCase().endsWith('.pdf')).sort()
}

/** Compares, or with `update` records, the PDF named `pdf` in `folder`. */
export async function compareChart(
  folder: string,
  pdf: string,
  { update = false }: CompareOptions = {},
): Promise<ComparisonResult> {
  const expectedPath = join(folder, expectedOutputName(pdf))
  if (update) {
    const actual = await importSummary(await readFile(join(folder, pdf)))
    await writeFile(expectedPath, `${JSON.stringify(actual, null, 2)}\n`)
    return { pdf, outcome: 'updated' }
  }
  const expected = await readExpectedOutput(expectedPath)
  if (!expected) return { pdf, outcome: 'no expected output' }
  const differences = differencesBetween(expected, await importSummary(await readFile(join(folder, pdf))), [])
  return differences.length === 0 ? { pdf, outcome: 'matches' } : { pdf, outcome: 'differs', differences }
}

export function expectedOutputName(pdf: string) {
  return pdf.replace(/\.pdf$/i, '.expected.json')
}

async function readExpectedOutput(path: string): Promise<ExpectedOutput | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function importSummary(bytes: Uint8Array): Promise<ExpectedOutput> {
  const workspace = createWorkspace({ readCharts: readChartsInProcess })
  await workspace.importPdf(new Uint8Array(bytes))
  // Through JSON, so it compares exactly as it would once stored.
  return JSON.parse(JSON.stringify({ charts: [...workspace.state.charts.values()].map(summarize) }))
}

/** How array items are named in a difference, by the array's key. */
const ITEM_NAMES: Record<string, string> = { charts: 'chart', legend: 'legend entry', importIssues: 'import issue' }

/** Each place where `actual` differs from `expected`, as a readable line. */
function differencesBetween(expected: unknown, actual: unknown, path: string[]): string[] {
  if (isObject(expected) && isObject(actual) && Array.isArray(expected) === Array.isArray(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])]
    return keys.flatMap((key) => differencesBetween(expected[key], actual[key], [...path, key]))
  }
  if (JSON.stringify(expected) === JSON.stringify(actual)) return []
  return [`${describePath(path)}: expected ${describe(expected)}, got ${describe(actual)}`]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function describe(value: unknown) {
  return value === undefined ? 'nothing' : JSON.stringify(value)
}

/** For example `chart 1 legend entry 2 stitches`, from `['charts', '0', 'legend', '1', 'stitches']`. */
function describePath(path: string[]) {
  let described = ''
  for (let at = 0; at < path.length; at++) {
    const item = ITEM_NAMES[path[at]]
    if (item && at + 1 < path.length) {
      described += `${described ? ' ' : ''}${item} ${Number(path[++at]) + 1}`
    } else {
      const named = described === '' || /\d$/.test(described)
      described += named ? `${described ? ' ' : ''}${path[at]}` : `.${path[at]}`
    }
  }
  return described || 'the output'
}

function summarize(chart: Chart): ChartSummary {
  const stitches = new Array<number>(chart.legend.length + 1).fill(0)
  for (const cell of chart.cells) stitches[cell]++
  return {
    ...(chart.title === undefined ? {} : { title: chart.title }),
    size: { width: chart.width, height: chart.height },
    legend: chart.legend.map(({ symbol, threads }, index) => ({ symbol, threads, stitches: stitches[index + 1] })),
    // How many cells each issue names, not which: enough to notice a change, and far shorter.
    importIssues: chart.importIssues.map((issue) =>
      'cells' in issue ? { ...issue, cells: issue.cells.length } : issue,
    ),
  }
}
