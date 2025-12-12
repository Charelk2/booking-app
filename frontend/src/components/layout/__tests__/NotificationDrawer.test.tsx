import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React, { act } from 'react';
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

  it('parses booking request for personalised video', () => {
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
    expect(parsed.subtitle).toBe('Personalised Video');
    expect(parsed.bookingType).toBe('Personalised Video');
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
    'New message from Charlie Brown: Hello there, this is a long me...'
  );
  });

  it('omits unread count when zero', () => {
    const n: UnifiedNotification = {
      type: 'message',
      timestamp: new Date().toISOString(),
      is_read: true,
      content: 'New message from Dana: Hi',
      booking_request_id: 6,
      name: 'Dana',
      unread_count: 0,
    } as UnifiedNotification;
    const parsed = parseItem(n);
    expect(parsed.title).toBe('Dana');
    expect(parsed.unreadCount).toBe(0);
    expect(parsed.subtitle).toBe('New message from Dana: Hi');
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
          error: new Error('Failed to load'),
        }),
      );
      await flushPromises();
    });
    const errorBar = document.querySelector('[data-testid="notification-error"]');
    expect(errorBar?.textContent).toBe('Failed to load');
  });

  it('renders notification item', async () => {
    const item: UnifiedNotification = {
      type: 'message',
      timestamp: new Date().toISOString(),
      is_read: true,
      content: 'New message from Eve: Hi',
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
        }),
      );
      await flushPromises();
    });

    expect(document.body.textContent).toContain('Eve');
  });

  it('calls onItemClick when card clicked', async () => {
    const item: UnifiedNotification = {
      type: 'message',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: 'Hi',
      booking_request_id: 8,
      name: 'Tom',
      unread_count: 1,
      link: '/booking-requests/8',
    } as UnifiedNotification;

    const onItemClick = jest.fn();
    await act(async () => {
      root.render(
        React.createElement(NotificationDrawer, {
          open: true,
          onClose: () => {},
          items: [item],
          onItemClick,
          markAllRead: jest.fn(),
        }),
      );
      await flushPromises();
    });

    const card = document.querySelector(
      '[data-testid="notification-list"] [role="button"]',
    ) as HTMLElement | null;
    if (card) {
      await act(async () => {
        card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();
      });
      expect(onItemClick).toHaveBeenCalledWith(8);
    }
  });

  it('renders mark all button and triggers handler', async () => {
    const markAllRead = jest.fn();
    await act(async () => {
      root.render(
        React.createElement(NotificationDrawer, {
          open: true,
          onClose: () => {},
          items: [],
          onItemClick: jest.fn(),
          markAllRead,
        }),
      );
      await flushPromises();
    });

    expect(document.body.textContent).toContain('Mark All Read');
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Mark All Read',
    ) as HTMLButtonElement | undefined;
    if (btn) {
      await act(async () => {
        btn.click();
        await flushPromises();
      });
      expect(markAllRead).toHaveBeenCalled();
    }
  });

  it('does not render Clear All button', async () => {
    await act(async () => {
      root.render(
        React.createElement(NotificationDrawer, {
          open: true,
          onClose: () => {},
          items: [],
          onItemClick: jest.fn(),
          markAllRead: jest.fn(),
        }),
      );
      await flushPromises();
    });

    const clearBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Clear All',
    );
    expect(clearBtn).toBeUndefined();
  });
});
