import { test, expect } from '@playwright/test';

// Per-route mobile performance budgets. These tests run in CI.

const budgets = [
  { url: '/', dcl: 2000 },
  { url: '/booking?service_provider_id=1&service_id=1', dcl: 3000 },
];

for (const { url, dcl } of budgets) {
  test(`loads ${url} within ${dcl}ms @mobile-perf`, async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const duration = await page.evaluate(() => {
      const { domContentLoadedEventEnd, navigationStart } = performance.timing;
      return domContentLoadedEventEnd - navigationStart;
    });
    expect(duration).toBeLessThan(dcl);
  });
}
