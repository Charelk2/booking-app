import { parseItem } from '../NotificationDrawer';
import type { UnifiedNotification } from '@/types';

describe('parseItem', () => {
  it('parses booking request with sender and type', () => {
    const n: UnifiedNotification = {
      type: 'new_booking_request',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'New booking request from Alice: Performance',
      id: 1,
      user_id: 1,
      link: '/booking-requests/1',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('Alice');
    expect(parsed.subtitle).toBe('sent a booking for Performance');
  });

  it('parses booking request with alternate separator', () => {
    const n: UnifiedNotification = {
      type: 'new_booking_request',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'New booking request from Alice for Personalized Video',
      id: 11,
      link: '/booking-requests/11',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('Alice');
    expect(parsed.subtitle).toBe('sent a booking for Personalized Video');
  });

  it('parses booking request with alternate separator', () => {
    const n: UnifiedNotification = {
      type: 'new_booking_request',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'New booking request from Alice for Personalized Video',
      id: 11,
      link: '/booking-requests/11',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('Alice');
    expect(parsed.subtitle).toBe('sent a booking for Personalized Video');
  });

  it('falls back to provided fields when missing from message', () => {
    const n: UnifiedNotification = {
      type: 'new_booking_request',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'New booking request #2',
      id: 2,
      link: '/booking-requests/2',
      sender_name: 'Bob',
      booking_type: 'Virtual Appearance',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('Bob');
    expect(parsed.subtitle).toBe('sent a booking for Virtual Appearance');
  });

  it('handles missing details with defaults', () => {
    const n: UnifiedNotification = {
      type: 'new_booking_request',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'New booking request #3',
      id: 3,
      link: '/booking-requests/3',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('New booking request');
    expect(parsed.subtitle).toBe('Booking Request');
  });

  it('parses message notification with unread count', () => {
    const n: UnifiedNotification = {
      type: 'message',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'Hello there, this is a long message that should be truncated properly.',
      booking_request_id: 5,
      name: 'Charlie Brown',
      unread_count: 3,
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('Charlie Brown (3)');
    expect(parsed.subtitle).toBe(
      'Last message: "Hello there, this is a long message that..."',
    );
  });
});
