import { parseNotification } from '../NotificationDrawer';
import type { Notification } from '@/types';

describe('parseNotification', () => {
  it('parses booking request with sender and type', () => {
    const n: Notification = {
      id: 1,
      user_id: 1,
      type: 'new_booking_request',
      message: 'New booking request from Alice: Performance',
      link: '/booking-requests/1',
      is_read: false,
      timestamp: new Date().toISOString(),
    };
    const parsed = parseNotification(n);
    expect(parsed.title).toBe('Alice');
    expect(parsed.subtitle).toBe('sent a new booking request');
  });

  it('falls back when no sender or type in message', () => {
    const n: Notification = {
      id: 2,
      user_id: 1,
      type: 'new_booking_request',
      message: 'New booking request #2',
      link: '/booking-requests/2',
      is_read: false,
      timestamp: new Date().toISOString(),
    };
    const parsed = parseNotification(n);
    expect(parsed.title).toBe('New booking request');
    expect(parsed.subtitle).toBe('Tap to view details');
  });
});
