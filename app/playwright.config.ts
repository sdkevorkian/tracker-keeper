import { defineConfig, devices } from '@playwright/test'

const port = 4173

// Runs the acceptance cases against the built app. The Workspace driver runs them under Vitest instead.
export default defineConfig({
  testDir: 'acceptance/runners',
  testMatch: '*.spec.ts',
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['./acceptance/runners/skipReasons.ts'], ...(process.env.CI ? [['github'] as const] : [])],
  use: {
    baseURL: `http://localhost:${port}/tracker-keeper/`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'browser', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}/tracker-keeper/`,
    reuseExistingServer: !process.env.CI,
  },
})
