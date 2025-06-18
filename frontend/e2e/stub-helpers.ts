import { Page } from '@playwright/test';

export async function stubLogin(page: Page) {
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
}

export async function stubRegister(page: Page) {
  await page.route('**/auth/register', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, name: 'Test Client', user_type: 'client' }),
    });
  });
}

export async function stubNotifications(page: Page) {
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
}

export async function stubBooking(page: Page, bookingId = 5) {
  await page.route(`**/api/v1/bookings/${bookingId}`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: bookingId,
        deposit_amount: 50,
        payment_status: 'pending',
        source_quote: { booking_request_id: 42 },
      }),
    });
  });
}

export async function stubPayments(page: Page, paymentId = 'pay_1') {
  await page.route('**/api/v1/payments', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_id: paymentId }),
    });
  });
  await page.route(`**/api/v1/payments/${paymentId}/receipt`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
      body: '%PDF-1.4 placeholder',
    });
  });
}

export async function stubArtist(page: Page, artistId = 1) {
  await page.route(`**/api/v1/artists/${artistId}`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: 'NYC' }),
    });
  });
  await page.route(`**/api/v1/artists/${artistId}/availability`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unavailable_dates: [] }),
    });
  });
}

export async function stubGoogleMaps(page: Page) {
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
}

export async function stubCatchAllApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  });
}

export async function setupDepositStubs(page: Page) {
  await stubLogin(page);
  await stubNotifications(page);
  await stubBooking(page);
  await stubPayments(page);
  await stubCatchAllApi(page);
  await stubGoogleMaps(page);
}
