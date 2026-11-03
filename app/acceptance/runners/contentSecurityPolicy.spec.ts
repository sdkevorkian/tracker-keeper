// Not an acceptance case: checks the built app's Content Security Policy, which
// keeps a malicious PDF that exploits a pdf.js bug from running code in the app.
// Code Playwright evaluates is exempt from the policy, so each check gets the page
// itself to run the code.
import { expect, test } from '@playwright/test'

type Probed = Window & { ran?: boolean }

test.beforeEach(async ({ page }) => {
  await page.goto('./')
})

test('the app refuses to run code built from a string', async ({ page }) => {
  await page.evaluate(() => setTimeout('window.ran = true', 0))
  await page.waitForTimeout(100)

  expect(await page.evaluate(() => (window as Probed).ran)).toBeUndefined()
})

test('the app refuses to run an inline script', async ({ page }) => {
  await expect(page.addScriptTag({ content: 'window.ran = true' })).rejects.toThrow(/Content Security Policy/)
})
