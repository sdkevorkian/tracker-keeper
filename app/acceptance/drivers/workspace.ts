// Reaches the app through the headless Workspace, in-process.
import { createWorkspace } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import type {
  Capability,
  Driver,
  ShownChart,
  ShownImportIssue,
  ShownLegendEntry,
  ShownStitches,
  SourcePagePlacement,
  Stitch,
} from './driver.ts'

export class WorkspaceDriver implements Driver {
  readonly name = 'Workspace'
  readonly capabilities: ReadonlySet<Capability> = new Set([
    'import',
    'source pages',
    'import issues',
    'every chart',
    'legend',
    'chart title',
  ])
  private workspace = createWorkspace({ readCharts: readChartsInProcess })
  private chartId?: string
  /** The charts the last import added, in the order it added them. */
  private importedIds: string[] = []

  async importPdf(bytes: Uint8Array) {
    const before = new Set(this.workspace.state.charts.keys())
    this.chartId = await this.workspace.importPdf(bytes)
    this.importedIds = [...this.workspace.state.charts.keys()].filter((id) => !before.has(id))
  }

  async importedCharts(): Promise<ShownChart[]> {
    return this.importedIds.map((id) => {
      const { width, height, cells, legend } = this.workspace.state.charts.get(id)!
      return {
        width,
        height,
        legend: legend.map(({ threads }, i) => ({
          thread: threads.map(({ brand, code }) => `${brand} ${code}`).join(' + '),
          stitches: cells.filter((cell) => cell === i + 1).length,
        })),
      }
    })
  }

  async shownChartSize() {
    const { width, height } = this.chart()
    return { width, height }
  }

  async sourcePagePlacements(): Promise<SourcePagePlacement[]> {
    return this.chart().source.pages.map(({ page, across, down }) => ({
      page,
      across,
      down,
    }))
  }

  async chartTitle() {
    return this.chart().title
  }

  async legend(): Promise<ShownLegendEntry[]> {
    // Only what the legend printed is shown.
    return this.chart().legend.map(({ threads, printedCount, color }) => ({
      threads: threads.map(({ brand, code, name, strands }) => ({
        thread: `${brand} ${code}`,
        ...(name !== undefined && { name }),
        ...(strands !== undefined && { strands }),
      })),
      ...(printedCount !== undefined && { printedStitches: printedCount }),
      color,
    }))
  }

  async importIssues(): Promise<ShownImportIssue[]> {
    const { width, legend, importIssues } = this.chart()
    const stitch = (cell: number): Stitch => [(cell % width) + 1, Math.floor(cell / width) + 1]
    const thread = (entry: number) => legend[entry - 1].threads.map(({ brand, code }) => `${brand} ${code}`).join(' + ')
    return importIssues.map((issue): ShownImportIssue => {
      switch (issue.kind) {
        case 'size mismatch':
          return { kind: issue.kind, printed: issue.printed, parsed: issue.parsed }
        case 'no symbols':
          return issue
        case 'legend count mismatch':
          return {
            kind: issue.kind,
            thread: thread(issue.entry),
            printed: issue.printed,
            parsed: issue.parsed,
            stitches: issue.cells.map(stitch),
          }
        case 'symbol not in legend':
          return { kind: issue.kind, stitches: issue.cells.map(stitch) }
        case 'legend entry with no stitches':
          return { kind: issue.kind, thread: thread(issue.entry) }
      }
    })
  }

  private chart() {
    if (!this.chartId) throw new Error('No chart has been imported')
    return this.workspace.state.charts.get(this.chartId)!
  }

  async longestBlockDuringImport(): Promise<number> {
    throw new Error('The Workspace driver has no page to block')
  }

  async shownStitches(): Promise<ShownStitches> {
    throw new Error('The Workspace driver has no view of the chart')
  }

  async zoomIn() {
    throw new Error('The Workspace driver has no view of the chart')
  }

  async dragChartLeft() {
    throw new Error('The Workspace driver has no view of the chart')
  }
}
