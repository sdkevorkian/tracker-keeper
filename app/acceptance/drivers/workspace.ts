// Reaches the app through the headless Workspace, in-process.
import { createWorkspace } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import type { Capability, Driver, ShownChart, ShownImportIssue, ShownStitches, SourcePagePlacement } from './driver.ts'

export class WorkspaceDriver implements Driver {
  readonly name = 'Workspace'
  readonly capabilities: ReadonlySet<Capability> = new Set(['import', 'source pages', 'import issues', 'every chart'])
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

  async importIssues(): Promise<ShownImportIssue[]> {
    return this.chart().importIssues.map((issue) =>
      issue.kind === 'size mismatch' ? { kind: issue.kind, printed: issue.printed, parsed: issue.parsed } : issue,
    )
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
