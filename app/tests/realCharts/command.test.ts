// @vitest-environment node
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, test } from 'vitest'

const command = fileURLToPath(new URL('./command.ts', import.meta.url))

test('run without a folder, the command explains what it needs and exits cleanly', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [command])

  expect(stdout).toContain('Usage: npm run compare-charts -- <folder> [--update]')
})
