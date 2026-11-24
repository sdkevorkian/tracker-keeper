// Reaches the app through the headless Workspace, in-process.
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import {
  listCharts,
  listProjects,
  openWorkspace,
  percentDone,
  suggestCopyTitle,
  type Workspace,
} from '../../src/workspace/workspace.ts'
import { readChartsInProcess } from '../../src/workspace/import/readCharts.ts'
import type {
  Capability,
  ChartPlace,
  Driver,
  ShownChart,
  ShownImportIssue,
  ShownLegendEntry,
  ShownProject,
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
    'reload',
    'chart library',
    'imported before',
    'rename charts',
    'delete charts',
    'delete projects',
    'projects',
  ])
  /** In memory, and kept across reloads like the browser's. */
  private database = { indexedDB: new IDBFactory(), IDBKeyRange }
  private opened?: Workspace
  private chartId?: string
  /** The project open, if the stitcher is in one. */
  private projectId?: string
  /** The charts the last import added, in the order it added them. */
  private importedIds: string[] = []
  /** A PDF imported before, while the app asks what to do with it. */
  private importingAgain?: { bytes: Uint8Array; ids: string[] }

  async importPdf(bytes: Uint8Array, titles?: string[]) {
    const workspace = await this.open()
    const before = new Set(workspace.state.charts.keys())
    this.chartId = await workspace.importPdf(bytes, { titles })
    this.importedIds = [...workspace.state.charts.keys()].filter((id) => !before.has(id))
  }

  async importPdfImportedBefore(bytes: Uint8Array) {
    const ids = await (await this.open()).importedBefore(bytes)
    if (ids.length === 0) throw new Error('This PDF has not been imported before')
    this.importingAgain = { bytes, ids }
    return ids.map((id) => this.workspace.state.charts.get(id)!.title ?? 'Untitled chart')
  }

  async openChartImportedBefore(title: string) {
    const { ids } = this.importedBefore()
    const chartId = ids.find((id) => this.workspace.state.charts.get(id)!.title === title)
    if (!chartId) throw new Error(`No chart titled "${title}" was named as imported before`)
    this.importingAgain = undefined
    this.chartId = chartId
    this.projectId = undefined
  }

  async importSeparateCopy(titles: string[] | undefined) {
    const { bytes, ids } = this.importedBefore()
    const { state } = this.workspace
    this.importingAgain = undefined
    await this.importPdf(bytes, titles ?? ids.map((id) => suggestCopyTitle(state, state.charts.get(id)!.title)))
  }

  async cancelImport() {
    this.importedBefore()
    this.importingAgain = undefined
  }

  /** The PDF the app said had been imported before, and the charts it named. */
  private importedBefore() {
    if (!this.importingAgain) throw new Error('The app is not asking about a PDF imported before')
    return this.importingAgain
  }

  async reload() {
    await this.opened?.whenSaved()
    this.opened = undefined
    this.importingAgain = undefined
    this.chartId = undefined
    this.projectId = undefined
    this.importedIds = []
  }

  async listedCharts() {
    return listCharts((await this.open()).state).map(({ title }) => title ?? 'Untitled chart')
  }

  async goToYourCharts() {
    this.chartId = undefined
    this.projectId = undefined
  }

  async startProject() {
    if (!this.chartId) throw new Error('No chart is open to start a project on')
    this.projectId = (await this.open()).startProject(this.chartId)
  }

  async renameProject(name: string) {
    this.workspace.renameProject(this.project().id, name)
  }

  async markStitch([across, down]: Stitch, done: boolean) {
    const chart = this.chart()
    this.workspace.markCells(this.project().id, [(down - 1) * chart.width + across - 1], done)
  }

  async markRun([fromAcross, fromDown]: Stitch, [toAcross, toDown]: Stitch) {
    const { width } = this.chart()
    const cells = []
    for (let down = Math.min(fromDown, toDown); down <= Math.max(fromDown, toDown); down++) {
      for (let across = Math.min(fromAcross, toAcross); across <= Math.max(fromAcross, toAcross); across++) {
        cells.push((down - 1) * width + across - 1)
      }
    }
    this.workspace.markCells(this.project().id, cells, true)
  }

  async undo() {
    this.workspace.undo(this.project().id)
  }

  async redo() {
    this.workspace.redo(this.project().id)
  }

  async percentDone() {
    return percentDone(this.chart(), this.project())
  }

  async listedProjects(chartTitle: string): Promise<ShownProject[]> {
    const { state } = await this.open()
    const chart = listCharts(state).find((listed) => listed.title === chartTitle)
    if (!chart) throw new Error(`No chart titled "${chartTitle}" is listed`)
    return listProjects(state, chart.id).map((project) => ({
      name: project.name,
      percentDone: percentDone(chart, project),
    }))
  }

  async openChart(title: string) {
    const chart = listCharts((await this.open()).state).find((listed) => listed.title === title)
    if (!chart) throw new Error(`No chart titled "${title}" is listed`)
    this.chartId = chart.id
    this.projectId = undefined
  }

  async renameChart(title: string, newTitle: string, from: ChartPlace) {
    const chart = await this.chartAt(title, from)
    this.workspace.renameChart(chart.id, newTitle)
  }

  async deleteChart(title: string, from: ChartPlace) {
    const chart = await this.chartAt(title, from)
    this.workspace.deleteChart(chart.id)
    // Its page is gone, so the stitcher is back on Your charts.
    this.chartId = undefined
  }

  async tryDeletingChart(title: string) {
    const chart = await this.chartAt(title, 'Your charts')
    try {
      this.workspace.deleteChart(chart.id)
      return undefined
    } catch (refused) {
      return (refused as Error).message
    }
  }

  async deleteProject(name: string) {
    const { state } = await this.open()
    const project = [...state.projects.values()].find((listed) => listed.name === name)
    if (!project) throw new Error(`No project named "${name}" is listed`)
    this.workspace.deleteProject(project.id)
  }

  async startDeletingProject(): Promise<void> {
    throw new Error('The Workspace driver has no confirmation to stop at')
  }

  async startDeletingChart(): Promise<void> {
    throw new Error('The Workspace driver has no confirmation to stop at')
  }

  async deleteConfirmation(): Promise<string> {
    throw new Error('The Workspace driver has no confirmation to read')
  }

  async cancelDelete() {
    throw new Error('The Workspace driver has no confirmation to cancel')
  }

  private async open() {
    this.opened ??= await openWorkspace({ readCharts: readChartsInProcess, database: this.database })
    return this.opened
  }

  /** The Workspace as last opened. Every query comes after an import, which opens it. */
  private get workspace() {
    if (!this.opened) throw new Error('The app has not been opened')
    return this.opened
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

  /** The chart with this title: the one open, or one Your charts lists. */
  private async chartAt(title: string, from: ChartPlace) {
    const workspace = await this.open()
    const chart =
      from === 'its page' ? this.chart() : listCharts(workspace.state).find((listed) => listed.title === title)
    if (chart?.title !== title)
      throw new Error(`No chart titled "${title}" is ${from === 'its page' ? 'open' : 'listed'}`)
    return chart
  }

  private chart() {
    if (!this.chartId) throw new Error('No chart has been imported')
    return this.workspace.state.charts.get(this.chartId)!
  }

  private project() {
    if (!this.projectId) throw new Error('No project is open')
    return this.workspace.state.projects.get(this.projectId)!
  }

  async longestBlockDuringImport(): Promise<number> {
    throw new Error('The Workspace driver has no page to block')
  }

  async shownStitches(): Promise<ShownStitches> {
    throw new Error('The Workspace driver has no view of the chart')
  }

  async shownSymbols(): Promise<never> {
    throw new Error('The Workspace driver has no view of the chart')
  }

  async displayStyle(): Promise<never> {
    throw new Error('The Workspace driver has no view of the chart')
  }

  async switchDisplayStyle() {
    throw new Error('The Workspace driver has no view of the chart')
  }

  async viewSourcePdf(): Promise<number> {
    throw new Error('The Workspace driver has no view of the chart')
  }

  async panAndZoomAround(): Promise<number> {
    throw new Error('The Workspace driver has no view of the chart')
  }

  async zoomIn() {
    throw new Error('The Workspace driver has no view of the chart')
  }

  async zoomOut() {
    throw new Error('The Workspace driver has no view of the chart')
  }

  async panRight() {
    throw new Error('The Workspace driver has no view of the chart')
  }

  async tabToChart() {
    throw new Error('The Workspace driver has no view of the chart')
  }

  async chartFocusRingShown(): Promise<boolean> {
    throw new Error('The Workspace driver has no view of the chart')
  }

  async fitChart() {
    throw new Error('The Workspace driver has no view of the chart')
  }

  async dragChartLeft() {
    throw new Error('The Workspace driver has no view of the chart')
  }

  async undoAndRedoOffered(): Promise<never> {
    throw new Error('The Workspace driver has no Undo or Redo buttons')
  }

  async moveCursor() {
    throw new Error('The Workspace driver has no cell cursor')
  }

  async pressSpace() {
    throw new Error('The Workspace driver has no cell cursor')
  }

  async cursor(): Promise<never> {
    throw new Error('The Workspace driver has no cell cursor')
  }

  async pressKey() {
    throw new Error('The Workspace driver has no keyboard')
  }

  async openShortcutHelp() {
    throw new Error('The Workspace driver has no shortcut help')
  }

  async shortcutHelp(): Promise<never> {
    throw new Error('The Workspace driver has no shortcut help')
  }

  async closeShortcutHelp() {
    throw new Error('The Workspace driver has no shortcut help')
  }

  async focusProjectName() {
    throw new Error('The Workspace driver has no text fields')
  }

  async shortcutButtonFocused(): Promise<never> {
    throw new Error('The Workspace driver has no shortcut help')
  }
}
