// Reaches the app the way a stitcher does: the built app in Chromium.
import { expect, type Page } from '@playwright/test'
import type { Capability, Driver } from './driver.ts'

export class BrowserDriver implements Driver {
  readonly name = 'browser'
  // The app has no Import button yet; #13 adds it.
  readonly capabilities: ReadonlySet<Capability> = new Set()

  private page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** Opens the app, failing if it doesn't load. */
  async open() {
    await this.page.goto('./')
    await expect(this.page.getByRole('heading', { name: 'tracker-keeper', level: 1 })).toBeVisible()
  }

  async importPdf(): Promise<void> {
    throw new Error('The browser driver does not support import yet')
  }

  async shownChartSize(): Promise<{ width: number; height: number }> {
    throw new Error('The browser driver does not support import yet')
  }
}
