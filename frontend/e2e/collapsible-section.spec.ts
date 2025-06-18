import { test, expect, devices } from '@playwright/test';
import { stubArtist, stubCatchAllApi, stubGoogleMaps } from './stub-helpers';

test.describe('CollapsibleSection mobile behavior', () => {
  test.skip(({ browserName, isMobile }) => !(browserName === 'webkit' && isMobile), 'iPhone WebKit only');

  test.beforeEach(async ({ page }) => {
    await stubArtist(page);
    await stubCatchAllApi(page);
    await stubGoogleMaps(page);
  });

  test('opens section when tapping header', async ({ page }) => {
    await page.goto('/booking?artist_id=1&service_id=1');
    await expect(page.getByTestId('step-heading')).toHaveText(/Date & Time/);
    await page.getByRole('button', { name: 'Location' }).click();
    await expect(page.getByTestId('step-heading')).toHaveText(/Location/);
  });
});

test.describe('CollapsibleSection cross-browser', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'Chrome and WebKit only');

  test.beforeEach(async ({ page }) => {
    await stubArtist(page);
    await stubCatchAllApi(page);
    await stubGoogleMaps(page);
  });

  test('toggles section on click', async ({ page }) => {
    await page.goto('/booking?artist_id=1&service_id=1');
    const dateButton = page.getByRole('button', { name: 'Date & Time' });
    const locationButton = page.getByRole('button', { name: 'Location' });
    await expect(dateButton).toHaveAttribute('aria-expanded', 'true');
    await expect(locationButton).toHaveAttribute('aria-expanded', 'false');
    await locationButton.click();
    await expect(locationButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('step-heading')).toHaveText(/Location/);
  });
});
