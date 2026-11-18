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
  ViewControl,
} from './driver.ts'

/** How long the app lets an import run before giving up on it. */
const IMPORT_TIMEOUT_MS = 60_000

/** More presses of Tab than it takes to reach the chart from the top of the page. */
const MOST_TABS_TO_CHART = 20

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
    'view controls',
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
        await this.pinch(deltaY)
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

  async zoomIn(using: ViewControl) {
    const before = await this.chartLabel()
    if (using === 'buttons') await this.page.getByRole('button', { name: 'Zoom in' }).click()
    else if (using === 'keyboard') await this.pressOnChart('+')
    else if (using === 'touch') await this.touchChart([-20, 20], [-120, 120], 0)
    else {
      const { x, y } = await this.chartCentre()
      await this.page.mouse.move(x, y)
      await this.pinch(-300)
    }
    await expect(this.chart()).not.toHaveAttribute('aria-label', before)
  }

  async zoomOut(using: ViewControl) {
    const before = await this.chartLabel()
    if (using === 'touch') throw new Error('Pinching in on a touchscreen is not driven yet')
    if (using === 'buttons') await this.page.getByRole('button', { name: 'Zoom out' }).click()
    else if (using === 'keyboard') await this.pressOnChart('-')
    else {
      const { x, y } = await this.chartCentre()
      await this.page.mouse.move(x, y)
      await this.pinch(300)
    }
    await expect(this.chart()).not.toHaveAttribute('aria-label', before)
  }

  async panRight(using: Exclude<ViewControl, 'buttons'>) {
    const before = await this.chartLabel()
    if (using === 'keyboard') await this.pressOnChart('ArrowRight')
    else if (using === 'touch') await this.touchChart([0], [0], -200)
    else {
      // A two-finger scroll to the right.
      const { x, y } = await this.chartCentre()
      await this.page.mouse.move(x, y)
      await this.page.mouse.wheel(200, 0)
    }
    await expect(this.chart()).not.toHaveAttribute('aria-label', before)
  }

  /**
   * Fingers on a touchscreen, sent as real touches so the page sees one pointer per finger.
   * Each finger starts at its offset across from the chart's centre, spreads to its end offset,
   * and all of them move `across` together, in 10 steps.
   */
  private async touchChart(start: number[], end: number[], across: number) {
    const { x, y } = await this.chartCentre()
    const cdp = await this.page.context().newCDPSession(this.page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', step: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints:
          type === 'touchEnd'
            ? []
            : start.map((from, id) => ({ id, x: x + from + ((end[id] - from + across) * step) / 10, y })),
      })
    await touch('touchStart', 0)
    for (let step = 1; step <= 10; step++) await touch('touchMove', step)
    await touch('touchEnd', 10)
    await cdp.detach()
  }

  /** A trackpad pinch over the pointer, which Chrome reports as a wheel turn with Ctrl held. Negative pinches out. */
  private async pinch(deltaY: number) {
    await this.page.keyboard.down('Control')
    await this.page.mouse.wheel(0, deltaY)
    await this.page.keyboard.up('Control')
  }

  /** Presses a key with the chart focused. */
  private async pressOnChart(key: string) {
    await this.chart().focus()
    await this.page.keyboard.press(key)
  }

  async tabToChart() {
    // Starts from the top of the page, as a stitcher arriving would.
    await this.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    for (let press = 0; press < MOST_TABS_TO_CHART; press++) {
      await this.page.keyboard.press('Tab')
      if (await this.chart().evaluate((chart) => chart === document.activeElement)) return
    }
    throw new Error(`The chart wasn't reached after ${MOST_TABS_TO_CHART} presses of Tab`)
  }

  async chartFocusRingShown() {
    return this.chart().evaluate((chart) => {
      const { outlineStyle, outlineWidth } = getComputedStyle(chart)
      return chart.matches(':focus-visible') && outlineStyle !== 'none' && parseFloat(outlineWidth) > 0
    })
  }

  async fitChart(using: Extract<ViewControl, 'buttons' | 'keyboard'>) {
    const before = await this.chartLabel()
    if (using === 'buttons') await this.page.getByRole('button', { name: 'Fit' }).click()
    else await this.pressOnChart('0')
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
