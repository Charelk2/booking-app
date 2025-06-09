import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './frontend/e2e',
  use: {
    browserName: 'chromium',
    viewport: devices['Pixel 5'].viewport,
  },
  webServer: {
    // Use the production build for faster startup in Docker.
    command: 'npm run start -- -p 3000',
    cwd: './frontend',
    port: 3000,
    timeout: 60 * 1000,
    reuseExistingServer: true,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
    },
    // TODO: verify no external calls are made during tests when CI blocks network
    // TODO: stub all API requests here to keep tests fully offline
  },
});
