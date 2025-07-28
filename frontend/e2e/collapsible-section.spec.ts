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
    await expect(page.getByTestId('step-heading')).toHaveText(/Event Type/);
    await page.getByRole('button', { name: 'Event Details' }).click();
    await expect(page.getByTestId('step-heading')).toHaveText(/Event Details/);
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
    const firstButton = page.getByRole('button', { name: 'Event Type' });
    const detailsButton = page.getByRole('button', { name: 'Event Details' });
    await expect(firstButton).toHaveAttribute('aria-expanded', 'true');
    await expect(detailsButton).toHaveAttribute('aria-expanded', 'false');
    await detailsButton.click();
    await expect(detailsButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('step-heading')).toHaveText(/Event Details/);
  });
});
