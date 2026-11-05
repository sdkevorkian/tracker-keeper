// Reaches the app the way a stitcher does: the built app in Chromium.
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'
import type { Capability, Driver, ShownChart, ShownImportIssue, ShownStitches, SourcePagePlacement } from './driver.ts'

/** The page, with the long tasks seen since the last import began. */
type WatchedWindow = Window & { longTasks?: number[] }

export class BrowserDriver implements Driver {
  readonly name = 'browser'
  readonly capabilities: ReadonlySet<Capability> = new Set(['import', 'responsiveness', 'pan and zoom'])

  private page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** Opens the app, failing if it doesn't load. */
  async open() {
    await this.page.goto('./')
    await expect(this.page.getByRole('heading', { name: 'tracker-keeper', level: 1 })).toBeVisible()
  }

  async importPdf(bytes: Uint8Array) {
    await this.page.evaluate(() => {
      const blocks: number[] = ((window as WatchedWindow).longTasks = [])
      new PerformanceObserver((list) => blocks.push(...list.getEntries().map(({ duration }) => duration))).observe({
        type: 'longtask',
      })
    })
    // Picked from disk like a stitcher's file. Handing Playwright the bytes instead
    // builds the file with script in the page, which blocks it.
    const file = join(await mkdtemp(join(tmpdir(), 'tracker-keeper-')), 'chart.pdf')
    await writeFile(file, bytes)
    const fileChooser = this.page.waitForEvent('filechooser')
    await this.page.getByRole('button', { name: 'Import' }).click()
    await (await fileChooser).setFiles(file)
    await expect(this.chart()).toBeVisible()
  }

  async shownChartSize() {
    const label = await this.chartLabel()
    const size = /(\d+) by (\d+) stitches/.exec(label)
    if (!size) throw new Error(`The chart's label doesn't give its size: "${label}"`)
    return { width: Number(size[1]), height: Number(size[2]) }
  }

  async longestBlockDuringImport() {
    return this.page.evaluate(() => Math.max(0, ...((window as WatchedWindow).longTasks ?? [])))
  }

  async shownStitches(): Promise<ShownStitches> {
    const label = await this.chartLabel()
    const shown = /showing stitches (\d+) to (\d+) across and (\d+) to (\d+) down/.exec(label)
    if (!shown) throw new Error(`The chart's label doesn't say which stitches it shows: "${label}"`)
    const [left, right, top, bottom] = shown.slice(1).map(Number)
    return { across: [left, right], down: [top, bottom] }
  }

  async sourcePagePlacements(): Promise<SourcePagePlacement[]> {
    throw new Error("The app doesn't show where source pages sit yet")
  }

  async importedCharts(): Promise<ShownChart[]> {
    throw new Error("The app doesn't list every imported chart yet")
  }

  async importIssues(): Promise<ShownImportIssue[]> {
    throw new Error("The app doesn't show import issues yet")
  }

  async zoomIn() {
    const before = await this.chartLabel()
    const { x, y } = await this.chartCentre()
    await this.page.mouse.move(x, y)
    await this.page.mouse.wheel(0, -300)
    await expect(this.chart()).not.toHaveAttribute('aria-label', before)
  }

  async dragChartLeft() {
    const before = await this.chartLabel()
    const { x, y } = await this.chartCentre()
    await this.page.mouse.move(x, y)
    await this.page.mouse.down()
    await this.page.mouse.move(x - 200, y, { steps: 5 })
    await this.page.mouse.up()
    await expect(this.chart()).not.toHaveAttribute('aria-label', before)
  }

  private async chartLabel() {
    return (await this.chart().getAttribute('aria-label')) ?? ''
  }

  private async chartCentre() {
    const box = await this.chart().boundingBox()
    if (!box) throw new Error('The chart is not on screen')
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }

  /** The canvas the chart is drawn on. Its accessible label says what it shows. */
  private chart() {
    return this.page.getByRole('img', { name: /^Chart\b/ })
  }
}
