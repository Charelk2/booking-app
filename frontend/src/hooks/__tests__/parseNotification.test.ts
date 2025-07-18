import React from 'react';
import parseNotification from '../parseNotification';
import type { Notification } from '@/types';

describe('parseNotification', () => {
  it('parses new message', () => {
    const n: Notification = {
      id: 1,
      user_id: 1,
      type: 'new_message',
      message: 'New message from Alice: Hello there',
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

  it('parses quote accepted', () => {
    const n: Notification = {
      id: 3,
      user_id: 1,
      type: 'quote_accepted',
      message: 'Quote 5 accepted',
      link: '/quotes/5',
      is_read: false,
      timestamp: new Date().toISOString(),
    } as Notification;
    const parsed = parseNotification(n);
    expect(parsed.title).toBe('Quote Accepted');
    expect(parsed.subtitle).toBe('Quote 5 accepted');
  });

  it('parses new booking', () => {
    const n: Notification = {
      id: 4,
      user_id: 1,
      type: 'new_booking',
      message: 'New booking #10 confirmed',
      link: '/dashboard/client/bookings/10',
      is_read: false,
      timestamp: new Date().toISOString(),
    } as Notification;
    const parsed = parseNotification(n);
    expect(parsed.title).toBe('Booking Confirmed');
    expect(parsed.subtitle).toBe('New booking #10 confirmed');
  });

  it('parses review request', () => {
    const n: Notification = {
      id: 5,
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

  it('parses message thread notification', () => {
    const n: Notification = {
      id: 6,
      user_id: 1,
      type: 'message_thread_notification',
      message: 'Last message preview',
      link: '/messages/2',
      is_read: false,
      timestamp: new Date().toISOString(),
      sender_name: 'Thread with Bob',
    } as Notification;
    const parsed = parseNotification(n);
    expect(parsed.title).toBe('Thread with Bob');
    expect(parsed.subtitle).toBe('Last message preview');
  });
});
