// Reaches the app the way a stitcher does: the built app in Chromium.
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'
import type {
  Capability,
  DisplayStyle,
  Driver,
  ShownChart,
  ShownImportIssue,
  ShownStitches,
  SourcePagePlacement,
} from './driver.ts'

/** How long the app lets an import run before giving up on it. */
const IMPORT_TIMEOUT_MS = 60_000

/** The page, with the long tasks seen since the last import began. */
type WatchedWindow = Window & { longTasks?: number[] }

export class BrowserDriver implements Driver {
  readonly name = 'browser'
  readonly capabilities: ReadonlySet<Capability> = new Set([
    'import',
    'responsiveness',
    'pan and zoom',
    'reload',
    'chart library',
    'chart pages',
    'view source PDF',
    'display styles',
    'symbol images',
  ])

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
    // As long as the app lets an import run, so a large chart is waited for.
    await expect(this.chart()).toBeVisible({ timeout: IMPORT_TIMEOUT_MS })
  }

  async reload() {
    await this.page.reload()
    await expect(this.page.getByRole('heading', { name: 'tracker-keeper', level: 1 })).toBeVisible()
  }

  async listedCharts() {
    const list = this.page.getByRole('list', { name: 'Your charts' })
    await expect(list).toBeVisible()
    return list.getByRole('link').allTextContents()
  }

  async goToYourCharts() {
    await this.page.getByRole('link', { name: 'Your charts' }).click()
  }

  async openChart(title: string) {
    await this.page.getByRole('list', { name: 'Your charts' }).getByRole('link', { name: title, exact: true }).click()
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

  async chartTitle(): Promise<never> {
    throw new Error('The app does not show the chart title yet')
  }

  async legend(): Promise<never> {
    throw new Error('The app does not show the legend yet')
  }

  async importIssues(): Promise<ShownImportIssue[]> {
    throw new Error("The app doesn't show import issues yet")
  }

  async shownSymbols() {
    // Symbols are cut from the source PDF after the chart opens; until then the label says so.
    await expect(this.chart()).toHaveAttribute('aria-label', /symbols as printed/)
    const label = await this.chartLabel()
    const symbols = /(\d+) symbols as printed and (\d+) built in/.exec(label)
    if (!symbols) throw new Error(`The chart's label doesn't say how its symbols are drawn: "${label}"`)
    return { asPrinted: Number(symbols[1]), builtIn: Number(symbols[2]) }
  }

  async displayStyle() {
    const label = await this.chartLabel()
    const style = /, in (symbols only|color blocks|color with symbols),/.exec(label)
    if (!style) throw new Error(`The chart's label doesn't say how it's drawn: "${label}"`)
    return style[1] as DisplayStyle
  }

  async switchDisplayStyle(style: DisplayStyle) {
    await this.page.getByRole('group', { name: 'Display style' }).getByRole('radio', { name: style }).check()
    await expect(this.chart()).toHaveAttribute('aria-label', new RegExp(`, in ${style},`))
  }

  async viewSourcePdf() {
    // Chrome shows the PDF in its own viewer. The headless shell the cases run in
    // has none, so it downloads it instead; either way the URL names the page.
    const openedAt = this.page
      .context()
      .waitForEvent('page')
      .then((tab) =>
        Promise.any([
          tab.waitForEvent('download').then((download) => download.url()),
          tab.waitForURL(/^blob:/).then(() => tab.url()),
        ]).finally(() => tab.close()),
      )
    await this.page.getByRole('button', { name: 'View source PDF' }).click()
    const url = await openedAt
    const page = /^blob:.*#page=(\d+)$/.exec(url)
    if (!page) throw new Error(`The source PDF opened without a page: ${url}`)
    return Number(page[1])
  }

  async panAndZoomAround() {
    await this.page.evaluate(() => {
      const blocks: number[] = ((window as WatchedWindow).longTasks = [])
      new PerformanceObserver((list) => blocks.push(...list.getEntries().map(({ duration }) => duration))).observe({
        type: 'longtask',
      })
    })
    const { x, y } = await this.chartCentre()
    await this.page.mouse.move(x, y)
    const zoom = async (deltaY: number) => {
      for (let step = 0; step < 12; step++) {
        await this.page.mouse.wheel(0, deltaY)
        // Let each zoom draw before the next, as a stitcher's scrolling would.
        await this.page.evaluate(() => new Promise(requestAnimationFrame))
      }
    }
    const drag = async (dx: number, dy: number) => {
      await this.page.mouse.down()
      await this.page.mouse.move(x + dx, y + dy, { steps: 20 })
      await this.page.mouse.up()
      await this.page.mouse.move(x, y)
    }
    // From the whole chart, in to symbols, across, and back out to the whole chart.
    await zoom(-300)
    await drag(-300, -200)
    await zoom(300)
    await drag(300, 200)
    // Long tasks are reported after they end.
    await this.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)))
    return this.page.evaluate(() => Math.max(0, ...((window as WatchedWindow).longTasks ?? [])))
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
