import { test, expect } from '@playwright/test';
import { stubCatchAllApi } from './stub-helpers';

test.describe('Footer help prompt', () => {
  test.beforeEach(async ({ page }) => {
    await stubCatchAllApi(page);
  });

  test('shows help links on the homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('help-prompt')).toBeVisible();
    await expect(page.getByRole('link', { name: 'FAQ' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Contact support' })).toBeVisible();
  });
});
