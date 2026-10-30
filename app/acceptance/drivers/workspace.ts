// Reaches the app through the headless Workspace, in-process.
import { createWorkspace } from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import type { Capability, Driver, ShownStitches } from './driver.ts'

export class WorkspaceDriver implements Driver {
  readonly name = 'Workspace'
  readonly capabilities: ReadonlySet<Capability> = new Set(['import'])
  private workspace = createWorkspace({ readCharts: readChartsInProcess })
  private chartId?: string

  async importPdf(bytes: Uint8Array) {
    this.chartId = await this.workspace.importPdf(bytes)
  }

  async shownChartSize() {
    if (!this.chartId) throw new Error('No chart has been imported')
    const { width, height } = this.workspace.state.charts.get(this.chartId)!
    return { width, height }
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
