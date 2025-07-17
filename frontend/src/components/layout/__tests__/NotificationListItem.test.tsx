import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import NotificationListItem, { parseItem } from '../NotificationListItem';
import type { UnifiedNotification } from '@/types';

const baseNotification: UnifiedNotification = {
  type: 'message',
  timestamp: new Date().toISOString(),
  is_read: false,
  content: 'New message: Hi',
  booking_request_id: 1,
  name: 'Alice',
} as UnifiedNotification;

describe('NotificationListItem', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('sets title attribute to parsed title', () => {
    act(() => {
      root.render(
        React.createElement(NotificationListItem, {
          n: baseNotification,
          onClick: () => {},
        }),
      );
    });
    const span = container.querySelector('span[title]');
    expect(span?.getAttribute('title')).toBe('Alice');
  });

  it('parses deposit due notifications', () => {
    const n: UnifiedNotification = {
      type: 'deposit_due',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'Deposit R200 due by 2025-12-31',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('Deposit Due');
    expect(parsed.icon).toBe('💰');
  });

  it('extracts amount and due date from deposit reminder', () => {
    const n: UnifiedNotification = {
      type: 'deposit_due',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'Deposit R50.00 due by 2025-01-01',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.subtitle).toBe('R50.00 due by Jan 1, 2025');
    expect(parsed.icon).toBe('💰');
  });


  it('parses review request notifications', () => {
    const n: UnifiedNotification = {
      type: 'review_request',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'Please review your booking #7',
      link: '/dashboard/client/bookings/7?review=1',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('Review Request');
    expect(parsed.icon).toBe('🔔');
  });

  it('sets title attribute for review request', () => {
    const n: UnifiedNotification = {
      type: 'review_request',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'Please review your booking #8',
      link: '/dashboard/client/bookings/8?review=1',
    } as UnifiedNotification;
    act(() => {
      root.render(
        React.createElement(NotificationListItem, {
          n,
          onClick: () => {},
        }),
      );
    });
    const span = container.querySelector('span[title]');
    expect(span?.getAttribute('title')).toBe('Review Request');
  });

  it('handles missing content gracefully', () => {
    const n: UnifiedNotification = {
      type: 'deposit_due',
      timestamp: new Date().toISOString(),
      is_read: false,
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('Deposit Due');
    expect(parsed.subtitle).toBe('');
  });

  it('parses new booking request with sender and service', () => {
    const n: UnifiedNotification = {
      type: 'new_booking_request',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'Location: Cape Town',
      sender_name: 'Jane Doe',
      booking_type: 'Acoustic Duo Performance',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('Jane Doe');
    expect(parsed.subtitle).toBe('Acoustic Duo Performance');
    expect(parsed.initials).toBe('JD');
  });

  it('parses quote accepted with client name', () => {
    const n: UnifiedNotification = {
      type: 'quote_accepted',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'Quote accepted by Bob Builder',
      sender_name: 'Bob Builder',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('Quote accepted by Bob Builder');
    expect(parsed.initials).toBe('BB');
  });
});
