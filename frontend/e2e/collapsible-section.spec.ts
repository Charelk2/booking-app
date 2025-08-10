import { test, expect, devices } from '@playwright/test';
import { stubServiceProvider, stubCatchAllApi, stubGoogleMaps } from './stub-helpers';

test.describe('CollapsibleSection mobile behavior', () => {
  test.skip(({ browserName, isMobile }) => !(browserName === 'webkit' && isMobile), 'iPhone WebKit only');

  test.beforeEach(async ({ page }) => {
    await stubServiceProvider(page);
    await stubCatchAllApi(page);
    await stubGoogleMaps(page);
  });

  test('opens section when tapping header', async ({ page }) => {
    await page.goto('/booking?service_provider_id=1&service_id=1');
    await expect(page.getByTestId('step-heading')).toHaveText(/Date & Time/);
    await page.getByRole('button', { name: 'Event Type' }).click();
    await expect(page.getByTestId('step-heading')).toHaveText(/Event Type/);
  });
});

test.describe('CollapsibleSection cross-browser', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'Chrome and WebKit only');

  test.beforeEach(async ({ page }) => {
    await stubServiceProvider(page);
    await stubCatchAllApi(page);
    await stubGoogleMaps(page);
  });

  test('toggles section on click', async ({ page }) => {
    await page.goto('/booking?service_provider_id=1&service_id=1');
    const firstButton = page.getByRole('button', { name: 'Date & Time' });
    const eventTypeButton = page.getByRole('button', { name: 'Event Type' });
    await expect(firstButton).toHaveAttribute('aria-expanded', 'true');
    await expect(eventTypeButton).toHaveAttribute('aria-expanded', 'false');
    await eventTypeButton.click();
    await expect(eventTypeButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('step-heading')).toHaveText(/Event Type/);
  });
});
