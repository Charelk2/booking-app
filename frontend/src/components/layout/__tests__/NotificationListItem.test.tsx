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
      content: 'Deposit payment due for booking #5',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('Deposit Due');
    expect(parsed.icon).toBe('💰');
  });

  it('parses new booking notifications', () => {
    const n: UnifiedNotification = {
      type: 'new_booking',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'New booking #5 confirmed',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('Booking Confirmed');
    expect(parsed.icon).toBe('📅');
  });
});
