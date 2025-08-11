import { test, expect } from '@playwright/test';

// Mobile viewport UX checks for keyboard, safe areas, and long content
// APIs are stubbed to keep tests fully offline.

test.describe('Mobile UX', () => {
  test.beforeEach(async ({ page }) => {
    // Generic stub for backend APIs
    await page.route('**/api/**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
    });
  });

  test('keyboard does not cover event description', async ({ page }) => {
    await page.goto('/booking?service_provider_id=1&service_id=1');
    await page.getByTestId('date-next-button').click();
    await page.getByRole('button', { name: 'Next' }).click();
    const textarea = page.locator('#event-description');
    await textarea.focus();
    // Simulate virtual keyboard reducing viewport height
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 300 });
    const box = await textarea.boundingBox();
    expect(box && box.y + box.height).toBeLessThan(300);
  });

  test('includes viewport-fit for safe areas', async ({ page }) => {
    await page.goto('/');
    const content = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(content).toContain('viewport-fit=cover');
  });

  test('handles long content in event description', async ({ page }) => {
    await page.goto('/booking?service_provider_id=1&service_id=1');
    await page.getByTestId('date-next-button').click();
    await page.getByRole('button', { name: 'Next' }).click();
    const textarea = page.locator('#event-description');
    const longText = 'lorem ipsum '.repeat(200);
    await textarea.fill(longText);
    await expect(textarea).toHaveValue(longText);
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(scrollHeight).toBeGreaterThan(page.viewportSize()!.height);
  });
});
