import { test, expect } from '@playwright/test';

// Stubs for all external requests keep the tests fully offline. Update as new
// endpoints are added so CI can run without network access.

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
    // Catch any other backend API calls and respond with an empty object
    await page.route('**/api/**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
    });
    // Stub Google Maps scripts and geocoding so the tests run without network
    await page.route('https://unpkg.com/@googlemaps/places@**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });
    await page.route('https://maps.googleapis.com/maps/api/js*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: 'window.google = window.google || { maps: {} };',
      });
    });
    await page.route('https://maps.googleapis.com/maps/api/geocode/**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'OK',
          results: [{ geometry: { location: { lat: 0, lng: 0 } } }],
        }),
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

  test('advances to location step', async ({ page }) => {
    await page.goto('/booking?artist_id=1&service_id=1');
    await expect(page.getByTestId('step-heading')).toHaveText(/Date & Time/);
    await page.getByTestId('date-next-button').click();
    await expect(page.getByTestId('step-heading')).toHaveText(/Location/);
  });
});
