import { test, expect } from '@playwright/test';
import { stubRegister, stubServiceProvider } from './stub-helpers';

test.describe('Signup to booking flow', () => {
  test.beforeEach(async ({ page }) => {
    await stubRegister(page);
    await stubServiceProvider(page);
  });

  test('completes signup, requests quote, and pays', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Email address').fill('new@test.com');
    await page.getByLabel('First name').fill('New');
    await page.getByLabel('Last name').fill('User');
    await page.getByLabel('Phone number').fill('+1234567890');
    await page.selectOption('#user_type', 'client');
    await page.getByLabel('Password').fill('secret!1');
    await page.getByLabel('Confirm password').fill('secret!1');
    await page.getByRole('button', { name: /sign up/i }).click();
    await expect(page).toHaveURL('/login');

    await page.getByLabel('Email address').fill('new@test.com');
    await page.getByLabel('Password').fill('secret!1');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL('/dashboard/client');

    await page.goto('/booking?service_provider_id=1&service_id=1');
    await expect(page.getByTestId('step-heading')).toHaveText(/Date & Time/);
    await page.getByTestId('date-next-button').click();
    await expect(page.getByTestId('step-heading')).toHaveText(/Event Type/);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByTestId('step-heading')).toHaveText(/Event Details/);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByTestId('step-heading')).toHaveText(/Location/);

    await page.goto('/booking-requests/42');
    await page.getByRole('button', { name: 'Accept' }).click();
    let responsePromise = page.waitForResponse('**/api/v1/payments');
    await page.getByRole('button', { name: 'Pay' }).click();
    let response = await responsePromise;
    expect(response.status()).toBe(200);
    await expect(page.getByRole('dialog')).not.toBeVisible();

    await page.goto('/dashboard/client/bookings');
    responsePromise = page.waitForResponse('**/api/v1/payments');
    // Pay in booking details page (button id updated in UI)
    await page.getByTestId('pay-now-button').first().click();
    response = await responsePromise;
    expect(response.status()).toBe(200);
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
