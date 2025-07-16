import React from 'react';
import parseNotification from '../parseNotification';
import type { Notification } from '@/types';

describe('parseNotification', () => {
  it('parses new message', () => {
    const n: Notification = {
      id: 1,
      user_id: 1,
      type: 'new_message',
      message: 'New message: Hello there',
      link: '/messages/1',
      is_read: false,
      timestamp: new Date().toISOString(),
      sender_name: 'Alice',
    };
    const parsed = parseNotification(n);
    expect(parsed.title).toBe('Alice');
    expect(parsed.subtitle).toBe('Hello there');
    expect(React.isValidElement(parsed.icon)).toBe(true);
  });

  it('parses booking request with type', () => {
    const n: Notification = {
      id: 2,
      user_id: 1,
      type: 'new_booking_request',
      message: 'You have a booking request',
      link: '/requests/2',
      is_read: false,
      timestamp: new Date().toISOString(),
      sender_name: 'Bob',
      booking_type: 'Performance',
    };
    const parsed = parseNotification(n);
    expect(parsed.title).toBe('Bob');
    expect(parsed.subtitle).toBe('sent a new booking request for Performance');
  });

  it('defaults for unknown type', () => {
    const n: Notification = {
      id: 3,
      user_id: 1,
      type: 'review_request',
      message: 'Please review',
      link: '/reviews',
      is_read: false,
      timestamp: new Date().toISOString(),
    } as Notification;
    const parsed = parseNotification(n);
    expect(parsed.title).toBe('Review Request');
    expect(parsed.subtitle).toBe('Please review');
  });
});
