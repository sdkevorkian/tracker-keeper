// Registers acceptance cases with Playwright Test, against the browser driver.
import { test } from '@playwright/test'
import type { AcceptanceTest } from '../dsl/acceptanceTest.ts'
import { skipReason } from '../dsl/missingCapabilities.ts'
import { Stitcher } from '../dsl/stitcher.ts'
import { BrowserDriver } from '../drivers/browser.ts'

export const playwrightAcceptanceTest: AcceptanceTest = (name, { needs }, body) => {
  test(name, async ({ page }) => {
    const driver = new BrowserDriver(page)
    await driver.open()
    const reason = skipReason(driver, needs)
    test.skip(reason !== undefined, reason)
    await body({ stitcher: new Stitcher(driver) })
  })
}
