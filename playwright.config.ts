import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './frontend/e2e',
  use: {
    browserName: 'chromium',
    viewport: devices['Pixel 5'].viewport,
  },
  webServer: {
    command: 'npm run dev -- -p 3000',
    cwd: './frontend',
    port: 3000,
    timeout: 120 * 1000,
    reuseExistingServer: true,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
    },
    // TODO: verify no external calls are made during tests when CI blocks network
  },
});
