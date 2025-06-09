import { test, expect } from '@playwright/test';

// TODO: Add additional request stubs here when new endpoints are introduced.
// Keeping tests fully offline ensures they run in restricted Docker networks.

test.describe('Booking Wizard mobile flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/artists/1', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: 'NYC' }),
      });
    });
    await page.route('**/api/v1/artists/1/availability', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unavailable_dates: [] }),
      });
    });
  });

  test('advances to location step', async ({ page }) => {
    await page.goto('/booking?artist_id=1&service_id=1');
    await expect(page.getByTestId('step-heading')).toHaveText(/Date & Time/);
    await page.getByTestId('date-next-button').click();
    await expect(page.getByTestId('step-heading')).toHaveText(/Location/);
  });
});
