import { parseItem } from '../NotificationDrawer';
import type { UnifiedNotification } from '@/types';

describe('parseItem', () => {
  it('parses booking request using provided fields', () => {
    const n: UnifiedNotification = {
      type: 'new_booking_request',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'New booking request from Alice: Performance',
      id: 1,
      user_id: 1,
      link: '/booking-requests/1',
      sender_name: 'Alice',
      booking_type: 'Performance',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('Alice');
    expect(parsed.subtitle).toBe('sent a new booking request for Perfo...');
    expect(parsed.bookingType).toBe('Performance');
  });

  it('parses booking request for personalized video', () => {
    const n: UnifiedNotification = {
      type: 'new_booking_request',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'New booking request from Alice for Personalized Video',
      id: 11,
      link: '/booking-requests/11',
      sender_name: 'Alice',
      booking_type: 'Personalized Video',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('Alice');
    expect(parsed.subtitle).toBe('sent a new booking request for Perso...');
    expect(parsed.bookingType).toBe('Personalized Video');
  });

  it('extracts metadata from details text', () => {
    const n: UnifiedNotification = {
      type: 'new_booking_request',
      timestamp: new Date().toISOString(),
      is_read: false,
      content:
        'New booking request from Alice: Performance\nDate: 2025-01-01\nLocation: Test',
      id: 4,
      link: '/booking-requests/4',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.metadata).toContain('📍 Test');
    expect(parsed.metadata).toContain('📅');
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
  expect(parsed.title).toBe('Charlie Brown');
  expect(parsed.unreadCount).toBe(3);
  expect(parsed.subtitle).toBe(
      'Last message: "Hello there, this is a long me..."',
  );
  });

  it('omits unread count when zero', () => {
    const n: UnifiedNotification = {
      type: 'message',
      timestamp: new Date().toISOString(),
      is_read: true,
      content: 'New message: Hi',
      booking_request_id: 6,
      name: 'Dana',
      unread_count: 0,
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('Dana');
    expect(parsed.unreadCount).toBe(0);
    expect(parsed.subtitle).toBe('Last message: "Hi"');
  });
});
