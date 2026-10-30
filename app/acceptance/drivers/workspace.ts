// Reaches the app through the headless Workspace, in-process.
import { createWorkspace } from '../../src/workspace/workspace.ts'
import type { Capability, Driver } from './driver.ts'

export class WorkspaceDriver implements Driver {
  readonly name = 'Workspace'
  readonly capabilities: ReadonlySet<Capability> = new Set(['import'])
  private workspace = createWorkspace()
  private chartId?: string

  async importPdf(bytes: Uint8Array) {
    this.chartId = await this.workspace.importPdf(bytes)
  }

  async shownChartSize() {
    if (!this.chartId) throw new Error('No chart has been imported')
    const { width, height } = this.workspace.state.charts.get(this.chartId)!
    return { width, height }
  }
}
