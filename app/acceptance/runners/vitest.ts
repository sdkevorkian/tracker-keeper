// Registers acceptance cases with Vitest.
import { test } from 'vitest'
import type { AcceptanceTest } from '../dsl/acceptanceTest.ts'
import { skipReason } from '../dsl/missingCapabilities.ts'
import { Stitcher } from '../dsl/stitcher.ts'
import type { Driver } from '../drivers/driver.ts'

export function vitestAcceptanceTest(createDriver: () => Driver): AcceptanceTest {
  return (name, { needs }, body) => {
    test(name, async (context) => {
      const driver = createDriver()
      const reason = skipReason(driver, needs)
      if (reason) context.skip(reason)
      await body({ stitcher: new Stitcher(driver) })
    })
  }
}
