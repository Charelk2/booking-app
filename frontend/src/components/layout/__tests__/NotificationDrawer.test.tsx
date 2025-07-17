import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import NotificationDrawer from '../NotificationDrawer';
import { parseItem } from '../NotificationListItem';
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
    expect(parsed.subtitle).toBe('Performance');
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
    expect(parsed.subtitle).toBe('Personalized Video');
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
  expect(parsed.subtitle).toBe('Hello there, this is a long me...');
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
    expect(parsed.subtitle).toBe('Hi');
  });
});

describe('NotificationDrawer component', () => {
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

  it('renders error message when provided', async () => {
    await act(async () => {
      root.render(
        React.createElement(NotificationDrawer, {
          open: true,
          onClose: () => {},
          items: [],
          onItemClick: jest.fn(),
          markAllRead: jest.fn(),
          loadMore: jest.fn(),
          hasMore: false,
          error: new Error('Failed to load'),
        }),
      );
      await Promise.resolve();
    });
    const errorBar = document.querySelector('[data-testid="notification-error"]');
    expect(errorBar?.textContent).toBe('Failed to load');
  });

  it('does not show badge when unread_count is string', async () => {
    const item: UnifiedNotification = {
      type: 'message',
      timestamp: new Date().toISOString(),
      is_read: true,
      content: 'New message: Hi',
      booking_request_id: 7,
      name: 'Eve',
      unread_count: '0' as unknown as number,
    } as UnifiedNotification;

    await act(async () => {
      root.render(
        React.createElement(NotificationDrawer, {
          open: true,
          onClose: () => {},
          items: [item],
          onItemClick: jest.fn(),
          markAllRead: jest.fn(),
          loadMore: jest.fn(),
          hasMore: false,
        }),
      );
      await Promise.resolve();
    });

    const badge = container.querySelector('span.bg-red-600');
    expect(badge).toBeNull();
  });
});
