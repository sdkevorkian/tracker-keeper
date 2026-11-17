// Registers acceptance cases with Vitest.
import { test } from 'vitest'
import type { AcceptanceTest } from '../dsl/acceptanceTest.ts'
import { skipReason } from '../dsl/missingCapabilities.ts'
import { Stitcher } from '../dsl/stitcher.ts'
import type { Driver } from '../drivers/driver.ts'

/** How long a slow case may take: three times Vitest's default, as Playwright's `test.slow()` gives. */
const SLOW_TIMEOUT_MS = 15_000

export function vitestAcceptanceTest(createDriver: () => Driver): AcceptanceTest {
  return (name, { needs, slow }, body) => {
    test(name, { timeout: slow ? SLOW_TIMEOUT_MS : undefined }, async (context) => {
      const driver = createDriver()
      const reason = skipReason(driver, needs)
      if (reason) context.skip(reason)
      await body({ stitcher: new Stitcher(driver) })
    })
  }
}
