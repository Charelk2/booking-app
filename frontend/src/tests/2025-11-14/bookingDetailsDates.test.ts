import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';
import { parseBookingDetailsFromMessage } from '@/lib/chat/bookingDetails';

describe('14 Nov 2025 – booking details date normalization', () => {
  it('normalizes dd/MM/yyyy to an ISO date the UI can format', () => {
    const content = `${BOOKING_DETAILS_PREFIX}
Date: 14/03/2026
Location: 10 Retief St`;

    const parsed = parseBookingDetailsFromMessage(content);

    expect(parsed.date).toBeDefined();
    const dt = parsed.date ? new Date(parsed.date) : null;
    expect(dt && Number.isNaN(dt.getTime())).toBe(false);
    expect(dt?.getUTCFullYear()).toBe(2026);
    expect(dt?.getUTCMonth()).toBe(2); // March (0-based)
    expect(dt?.getUTCDate()).toBe(14);
  });

  it('normalizes dd/MM/yyyy HH:mm to an ISO datetime', () => {
    const content = `${BOOKING_DETAILS_PREFIX}
Date: 14/03/2026 19:30
Location: 10 Retief St`;

    const parsed = parseBookingDetailsFromMessage(content);

    expect(parsed.date).toBeDefined();
    const dt = parsed.date ? new Date(parsed.date) : null;
    expect(dt && Number.isNaN(dt.getTime())).toBe(false);
    expect(dt?.getUTCFullYear()).toBe(2026);
    expect(dt?.getUTCMonth()).toBe(2);
    expect(dt?.getUTCDate()).toBe(14);
    expect(dt?.getUTCHours()).toBe(19);
    expect(dt?.getUTCMinutes()).toBe(30);
  });

  it('does not set date when the value is invalid', () => {
    const content = `${BOOKING_DETAILS_PREFIX}
Date: not-a-date
Location: Cape Town`;

    const parsed = parseBookingDetailsFromMessage(content);

    expect(parsed.date).toBeUndefined();
  });
});
