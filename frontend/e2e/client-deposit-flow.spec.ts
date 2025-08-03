import { test, expect, devices } from '@playwright/test';
import { setupDepositStubs } from './stub-helpers';

// Ensure mobile viewport for all tests in this file
// This mirrors the setup used in mobile-booking.spec.ts
// and allows us to assert UI layout on small screens.
// eslint-disable-next-line playwright/use-describe
test.use({ ...devices['iPhone 14 Pro'] });

test.describe('Client deposit flow from notification', () => {
  test.beforeEach(async ({ page }) => {
    await setupDepositStubs(page);
  });

  test('pays deposit via notification link', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill('client@test.com');
    await page.getByLabel('Password').fill('secret');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL('/dashboard');

    await page.getByRole('button', { name: /view notifications/i }).click();
    await page.getByText('Deposit Due').click();
    await expect(page).toHaveURL('/dashboard/client/bookings/5?pay=1');

    const viewport = page.viewportSize();
    expect(viewport?.width).toBe(devices['iPhone 14 Pro'].viewport.width);
    expect(viewport?.height).toBe(devices['iPhone 14 Pro'].viewport.height);

    const responsePromise = page.waitForResponse('**/api/v1/payments');
    await page.getByRole('button', { name: 'Pay' }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
