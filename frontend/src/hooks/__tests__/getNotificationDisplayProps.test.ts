import getNotificationDisplayProps from '../getNotificationDisplayProps';
import type { Notification, UnifiedNotification } from '@/types';

describe('getNotificationDisplayProps', () => {
  const assignSpy = jest.spyOn(window.location, 'assign').mockImplementation(() => {});

  afterEach(() => {
    assignSpy.mockClear();
  });

  it('maps new message notification', () => {
    const n: Notification = {
      id: 1,
      user_id: 1,
      type: 'new_message',
      message: 'New message from Bob: Hi there',
      link: '/booking-requests/1',
      is_read: false,
      timestamp: '2025-01-01T00:00:00Z',
      sender_name: 'Bob',
    };
    const props = getNotificationDisplayProps(n);
    expect(props.type).toBe('reminder');
    expect(props.from).toBe('Bob');
    expect(props.subtitle).toContain('Hi there');
    props.onClick();
    expect(assignSpy).toHaveBeenCalledWith('/booking-requests/1');
  });

  it('maps booking confirmation unified notification', () => {
    const n: UnifiedNotification = {
      type: 'new_booking',
      timestamp: '2025-01-02T00:00:00Z',
      is_read: false,
      content: 'New booking #5',
      link: '/dashboard/client/bookings/5',
    } as UnifiedNotification;
    const props = getNotificationDisplayProps(n);
    expect(props.type).toBe('reminder');
    expect(props.from).toBe('Booking Confirmed');
    props.onClick();
    expect(assignSpy).toHaveBeenCalledWith('/dashboard/client/bookings/5');
  });

  it('builds booking request display props', () => {
    const n: Notification = {
      id: 2,
      user_id: 1,
      type: 'new_booking_request',
      message: 'Request',
      link: '/requests/2',
      is_read: false,
      timestamp: '2025-01-03T00:00:00Z',
      sender_name: 'Alice',
      booking_type: 'Acoustic Performance',
    };
    const props = getNotificationDisplayProps(n);
    expect(props.type).toBe('reminder');
    expect(props.from).toBe('Alice');
    expect(props.subtitle).toBe('Acoustic Performance');
    props.onClick();
    expect(assignSpy).toHaveBeenCalledWith('/requests/2');
  });

  it('handles review request link mapping', () => {
    const n: UnifiedNotification = {
      type: 'review_request',
      timestamp: '2025-01-04T00:00:00Z',
      is_read: false,
      content: 'Please review',
      link: '/dashboard/client/bookings/7?review=1',
    } as UnifiedNotification;
    const props = getNotificationDisplayProps(n);
    expect(props.type).toBe('reminder');
    props.onClick();
    expect(assignSpy).toHaveBeenCalledWith('/dashboard/client/bookings/7?review=1');
  });

  it('includes avatarUrl when provided', () => {
    const n: Notification = {
      id: 3,
      user_id: 1,
      type: 'new_message',
      message: 'New message from Ava: hi',
      link: '/booking-requests/3',
      is_read: false,
      timestamp: '2025-01-05T00:00:00Z',
      sender_name: 'Ava',
      avatar_url: '/static/pic.jpg',
    };
    const props = getNotificationDisplayProps(n);
    expect(props.avatarUrl).toBe('/static/pic.jpg');
  });

  it('prefers profile_picture_url over avatar_url', () => {
    const n: Notification = {
      id: 4,
      user_id: 1,
      type: 'new_message',
      message: 'New message from Jay: hi',
      link: '/booking-requests/4',
      is_read: false,
      timestamp: '2025-01-06T00:00:00Z',
      sender_name: 'Jay',
      profile_picture_url: '/static/profile.jpg',
      avatar_url: '/static/pic.jpg',
    };
    const props = getNotificationDisplayProps(n);
    expect(props.avatarUrl).toBe('/static/profile.jpg');
  });
});
