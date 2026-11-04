// Reaches the app through the headless Workspace, in-process.
import { createWorkspace } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import type { Capability, Driver, ShownImportIssue, ShownStitches, SourcePagePlacement } from './driver.ts'

export class WorkspaceDriver implements Driver {
  readonly name = 'Workspace'
  readonly capabilities: ReadonlySet<Capability> = new Set(['import', 'source pages', 'import issues'])
  private workspace = createWorkspace({ readCharts: readChartsInProcess })
  private chartId?: string

  async importPdf(bytes: Uint8Array) {
    this.chartId = await this.workspace.importPdf(bytes)
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
    return this.chart().importIssues.map(({ kind, printed, parsed }) => ({ kind, printed, parsed }))
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
