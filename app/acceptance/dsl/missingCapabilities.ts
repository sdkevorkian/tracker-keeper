import type { Capability, Driver } from '../drivers/driver.ts'

/** Why a case can't run on this driver, or undefined if it can. */
export function skipReason(driver: Driver, needs: Capability[]) {
  const missing = needs.filter((capability) => !driver.capabilities.has(capability))
  return missing.length === 0 ? undefined : `The ${driver.name} driver doesn't support ${missing.join(', ')} yet`
}
