import { test, expect } from '@playwright/test';
import { stubRegister, stubConfirmEmail, stubCatchAllApi, stubRegisterServiceProvider } from './stub-helpers';

test.describe('Auth flow', () => {
  test.beforeEach(async ({ page }) => {
    await stubCatchAllApi(page);
  });

  test('registration redirects to confirm email', async ({ page }) => {
    await stubRegister(page);
    await page.goto('/register');
    await page.getByLabel('Email address').fill('new@test.com');
    await page.getByLabel('First name').fill('New');
    await page.getByLabel('Last name').fill('User');
    await page.getByLabel('Phone number').fill('+1234567890');
    await page.selectOption('#user_type', 'client');
    await page.getByLabel('Password').fill('secret!1');
    await page.getByLabel('Confirm password').fill('secret!1');
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page).toHaveURL('/confirm-email');
    await expect(page.getByText('Check your email')).toBeVisible();
  });

  test('service provider registration skips email confirmation', async ({ page }) => {
    await stubRegisterServiceProvider(page);
    await page.goto('/register');
    await page.getByLabel('Email address').fill('sp@test.com');
    await page.getByLabel('First name').fill('New');
    await page.getByLabel('Last name').fill('Provider');
    await page.getByLabel('Phone number').fill('+1234567890');
    await page.selectOption('#user_type', 'service_provider');
    await page.getByLabel('Password').fill('secret!1');
    await page.getByLabel('Confirm password').fill('secret!1');
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page).toHaveURL('/login');
    await expect(page.getByText('Registration successful!')).toBeVisible();
  });

  test('confirm email success and failure', async ({ page }) => {
    await stubConfirmEmail(page, 200);
    await page.goto('/confirm-email?token=abc');
    await expect(page.getByText('Email confirmed!')).toBeVisible();
    await page.getByRole('button', { name: /continue to login/i }).click();
    await expect(page).toHaveURL('/login');

    await stubConfirmEmail(page, 400);
    await page.goto('/confirm-email?token=bad');
    await expect(page.getByText('Invalid or expired token.')).toBeVisible();
  });

  test('social login buttons initiate OAuth flow', async ({ page }) => {
    await page.route('**/auth/google/login**', (route) => route.abort());
    await page.route('**/auth/github/login**', (route) => route.abort());
    await page.goto('/login');
    const [googleReq] = await Promise.all([
      page.waitForRequest('**/auth/google/login**'),
      page.getByRole('button', { name: /google/i }).click(),
    ]);
    expect(googleReq.url()).toContain('/auth/google/login?next=%2Fdashboard');
    const [githubReq] = await Promise.all([
      page.waitForRequest('**/auth/github/login**'),
      page.getByRole('button', { name: /github/i }).click(),
    ]);
    expect(githubReq.url()).toContain('/auth/github/login?next=%2Fdashboard');
  });
});
