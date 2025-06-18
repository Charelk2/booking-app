import { test, expect, devices } from '@playwright/test';

// Ensure mobile viewport for all tests in this file
// This mirrors the setup used in mobile-booking.spec.ts
// and allows us to assert UI layout on small screens.
// eslint-disable-next-line playwright/use-describe
test.use({ ...devices['iPhone 14 Pro'] });

test.describe('Client deposit flow from notification', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: 'token123',
          user: { id: 1, name: 'Test Client', user_type: 'client' },
        }),
      });
    });
    await page.route('**/api/v1/notifications**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          {
            id: 1,
            type: 'deposit_due',
            timestamp: new Date().toISOString(),
            is_read: false,
            content: 'Deposit payment due for booking #5',
            link: '/dashboard/client/bookings/5?pay=1',
          },
        ]),
      });
    });
    await page.route('**/api/v1/bookings/5', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 5,
          deposit_amount: 50,
          payment_status: 'pending',
          source_quote: { booking_request_id: 42 },
        }),
      });
    });
    await page.route('**/api/v1/payments', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: 'pay_1' }),
      });
    });
    await page.route('**/api/v1/payments/pay_1/receipt', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
        body: '%PDF-1.4 placeholder',
      });
    });
    await page.route('**/api/**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
    });
    await page.route('https://maps.googleapis.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: 'window.google = window.google || { maps: {} };',
      });
    });
    await page.route('https://maps.gstatic.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: '',
      });
    });
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
