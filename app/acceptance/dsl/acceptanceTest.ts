// How a case is declared. Each runner supplies its own implementation that
// registers the case with its test framework and its driver.
import type { Capability } from '../drivers/driver.ts'
import type { Stitcher } from './stitcher.ts'

export interface CaseOptions {
  /** Capabilities the case needs. It is skipped for drivers that lack any of them. */
  needs: Capability[]
}

export type AcceptanceTest = (
  name: string,
  options: CaseOptions,
  body: (context: { stitcher: Stitcher }) => Promise<void>,
) => void
