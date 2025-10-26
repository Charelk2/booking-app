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
  await stubLogin(page);
  await page.route('**/auth/register', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, name: 'Test Client', user_type: 'client' }),
    });
  });
}

export async function stubRegisterServiceProvider(page: Page) {
  await stubLogin(page);
  await page.route('**/auth/register', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, name: 'Test Provider', user_type: 'service_provider' }),
    });
  });
}

export async function stubConfirmEmail(page: Page, status = 200) {
  await page.route('**/auth/confirm-email', async (route) => {
    await route.fulfill({
      status,
      headers: { 'Content-Type': 'application/json' },
      body: status === 200 ? '{}' : JSON.stringify({ detail: 'Invalid or expired token' }),
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
          type: 'new_booking',
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
        // deposit removed
        payment_status: 'pending',
        booking_request_id: 42,
      }),
    });
  });
}

export async function stubBookingRequest(page: Page, requestId = 42) {
  await page.route(`**/api/v1/booking-requests/${requestId}`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: requestId,
        client_id: 1,
        service_provider_id: 1,
        service_id: 1,
        status: 'quote_provided',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client: { first_name: 'Client' },
        service_provider: { user: { first_name: 'Provider' } },
        service: { title: 'Gig' },
      }),
    });
  });
}

export async function stubMessages(page: Page, requestId = 42, quoteId = 1) {
  await page.route(
    `**/api/v1/booking-requests/${requestId}/messages`,
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          {
            id: 1,
            booking_request_id: requestId,
            sender_id: 1,
            sender_type: 'service_provider',
            content: 'Quote',
            // Backend emits message types in uppercase.
            message_type: 'QUOTE',
            quote_id: quoteId,
            timestamp: new Date().toISOString(),
          },
        ]),
      });
    },
  );
}

export async function stubQuoteFlow(
  page: Page,
  quoteId = 1,
  bookingId = 5,
) {
  let status = 'pending';
  await page.route(`**/api/v1/quotes/${quoteId}`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: quoteId,
        booking_id: status === 'accepted' ? bookingId : null,
        booking_request_id: 42,
        service_provider_id: 1,
        client_id: 1,
        services: [{ description: 'Gig', price: 100 }],
        sound_fee: 0,
        travel_fee: 0,
        subtotal: 100,
        total: 100,
        status,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
  });

  await page.route(`**/api/v1/quotes/${quoteId}/accept`, async (route) => {
    status = 'accepted';
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: bookingId,
        quote_id: quoteId,
        service_provider_id: 1,
        client_id: 1,
        confirmed: true,
        payment_status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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

export async function stubServiceProvider(page: Page, serviceProviderId = 1) {
  await page.route(`**/api/v1/service-provider-profiles/${serviceProviderId}`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: 'NYC' }),
    });
  });
  await page.route(`**/api/v1/service-provider-profiles/${serviceProviderId}/availability`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unavailable_dates: [] }),
    });
  });
}

export async function stubGoogleMaps(page: Page) {
  await page.route('https://unpkg.com/@googlemaps/extended-component-library@**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
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
  await stubBookingRequest(page);
  await stubMessages(page);
  await stubQuoteFlow(page);
  await stubPayments(page);
  await stubCatchAllApi(page);
  await stubGoogleMaps(page);
}
