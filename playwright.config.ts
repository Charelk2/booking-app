import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './frontend/e2e',
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox',  use: { browserName: 'firefox'  } },
    { name: 'webkit',   use: { browserName: 'webkit'   } },
    // Mobile emulation projects for iOS and Android
    {
      name: 'mobile-ios',
      use: { ...devices['iPhone 14 Pro'] },
    },
    {
      name: 'mobile-android',
      use: { ...devices['Pixel 5'] },
    },
  ],
  workers: 2,
  use: { headless: true, video: 'off', screenshot: 'off' },
  webServer: {
    // Use a production build for reliable offline testing.
    command: 'npm run build && npm run start -- -p 3000',
    cwd: './frontend',
    port: 3000,
    timeout: 60 * 1000,
    reuseExistingServer: true,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
  globalSetup: './scripts/playwright-global-setup.js',
  globalTeardown: './scripts/playwright-global-teardown.js',
});
