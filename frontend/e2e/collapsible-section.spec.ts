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
