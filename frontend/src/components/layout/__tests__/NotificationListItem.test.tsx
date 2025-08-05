import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import NotificationListItem, { parseItem } from '../NotificationListItem';
import type { UnifiedNotification } from '@/types';

const baseNotification: UnifiedNotification = {
  type: 'message',
  timestamp: new Date().toISOString(),
  is_read: false,
  content: 'New message from Alice: Hi',
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

  it('parses message preview from content', () => {
    const parsed = parseItem(baseNotification);
    expect(parsed.subtitle).toBe('New message from Alice: Hi');
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
    expect(parsed.status).toBe('due');
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
    expect(parsed.status).toBe('due');
  });

  it('parses celebratory deposit due messages', () => {
    const n: UnifiedNotification = {
      type: 'deposit_due',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'Booking confirmed – Deposit R75 due by 2025-07-01',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.subtitle).toBe('Booking confirmed');
    expect(parsed.metadata).toBe('R75 due by Jul 1, 2025');
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
    expect(parsed.status).toBe('reminder');
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
    expect(parsed.status).toBe('confirmed');
  });

  it('falls back to type when content lacks quote text', () => {
    const n: UnifiedNotification = {
      type: 'quote_accepted',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: '',
      sender_name: 'Sam Client',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('Quote accepted by Sam Client');
    expect(parsed.status).toBe('confirmed');
  });

  it('parses quote expiring notification', () => {
    const n: UnifiedNotification = {
      type: 'quote_expiring',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'Quote #10 expiring soon',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('Quote Expiring');
    expect(parsed.icon).toBe('⏰');
    expect(parsed.status).toBe('reminder');
  });

  it('uses initials fallback for deposit due', () => {
    const n: UnifiedNotification = {
      type: 'deposit_due',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'Deposit R100 due by 2025-06-30',
      sender_name: 'John Doe',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.initials).toBe('JD');
  });

  it('includes initials for unknown notification types', () => {
    const n: UnifiedNotification = {
      type: 'weird_event',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'Something random',
      name: 'Jane Smith',
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.initials).toBe('JS');
  });

  it('renders a profile image for confirmed status', () => {
    const n: UnifiedNotification = {
      type: 'quote_accepted',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'Quote accepted by Jill',
      sender_name: 'Jill',
      avatar_url: '/static/avatar.jpg',
    } as UnifiedNotification;

    act(() => {
      root.render(
        React.createElement(NotificationListItem, {
          n,
          onClick: () => {},
        }),
      );
    });

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('avatar.jpg');
  });

  it('renders a profile image for reminder status', () => {
    const n: UnifiedNotification = {
      type: 'new_booking_request',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'Location: Test',
      sender_name: 'Jane',
      booking_type: 'Performance',
      avatar_url: '/static/avatar.jpg',
    } as UnifiedNotification;

    act(() => {
      root.render(
        React.createElement(NotificationListItem, {
          n,
          onClick: () => {},
        }),
      );
    });

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('avatar.jpg');
  });

  it('renders a profile image for due status', () => {
    const n: UnifiedNotification = {
      type: 'deposit_due',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'Deposit R50 due by 2025-06-30',
      avatar_url: '/static/avatar.jpg',
    } as UnifiedNotification;

    act(() => {
      root.render(
        React.createElement(NotificationListItem, {
          n,
          onClick: () => {},
        }),
      );
    });

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('avatar.jpg');
  });

  it('prefers profile picture over avatar url', () => {
    const n: UnifiedNotification = {
      type: 'deposit_due',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'Deposit R60 due by 2025-06-30',
      profile_picture_url: '/static/profile.jpg',
      avatar_url: '/static/avatar.jpg',
    } as UnifiedNotification;

    const parsed = parseItem(n);
    expect(parsed.avatarUrl).toBe('/static/profile.jpg');

    act(() => {
      root.render(
        React.createElement(NotificationListItem, {
          n,
          onClick: () => {},
        }),
      );
    });

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('profile.jpg');
  });

  it('falls back to a default avatar when no avatar URL is provided', () => {
    const n: UnifiedNotification = {
      type: 'deposit_due',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'Deposit R75 due by 2025-06-30',
    } as UnifiedNotification;

    act(() => {
      root.render(
        React.createElement(NotificationListItem, {
          n,
          onClick: () => {},
        }),
      );
    });

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('default-avatar.svg');
    expect(container.textContent).not.toContain('💰');
  });

  it('passes avatarUrl to Avatar component', () => {
    const n: UnifiedNotification = {
      type: 'message',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'New message from Ana: hi',
      booking_request_id: 8,
      name: 'Ana',
      avatar_url: '/static/avatar.jpg',
    } as UnifiedNotification;

    act(() => {
      root.render(
        React.createElement(NotificationListItem, {
          n,
          onClick: () => {},
        }),
      );
    });

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('avatar.jpg');
  });
});
