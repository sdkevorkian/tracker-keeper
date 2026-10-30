// Lists skipped cases with the reason, which Playwright's list reporter leaves out.
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'

export default class SkipReasons implements Reporter {
  private skipped: string[] = []

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status !== 'skipped') return
    const reason = result.annotations.find(({ type }) => type === 'skip')?.description ?? 'no reason given'
    this.skipped.push(`  ${test.title}: ${reason}`)
  }

  onEnd() {
    if (this.skipped.length > 0) console.log(`\nSkipped:\n${this.skipped.join('\n')}`)
  }

  printsToStdio() {
    return true
  }
}
