import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_LIVE_BASE_URL?.trim() || 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  grep: /@live/,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chrome-live',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
  ],
})
