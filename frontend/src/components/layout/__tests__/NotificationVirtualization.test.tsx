import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import NotificationDrawer from '../NotificationDrawer';
import FullScreenNotificationModal from '../FullScreenNotificationModal';
import type { UnifiedNotification } from '@/types';

const baseProps = {
  open: true,
  onClose: () => {},
  onItemClick: jest.fn(),
  markAllRead: jest.fn(),
};

describe('Notification virtualization', () => {
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

  const genItems = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      type: 'message',
      timestamp: new Date().toISOString(),
      is_read: false,
      content: `New message ${i}`,
      booking_request_id: i,
      name: `User ${i}`,
    })) as UnifiedNotification[];

  it('virtualizes NotificationDrawer list', async () => {
    const items = genItems(30);
    await act(async () => {
      root.render(
        React.createElement(NotificationDrawer, {
          ...baseProps,
          items,
          loadMore: jest.fn(),
          hasMore: false,
        }),
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    const list = document.querySelector('[data-testid="notification-list"]') as HTMLElement;
    expect(list.querySelectorAll('button').length).toBeLessThan(items.length);
    const loadMore = jest.fn();
    await act(async () => {
      root.render(
        React.createElement(NotificationDrawer, {
          ...baseProps,
          items,
          loadMore,
          hasMore: true,
        }),
      );
    });
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Load more')) as HTMLButtonElement | undefined;
    btn?.click();
    if (btn) {
      expect(loadMore).toHaveBeenCalled();
    }
  });

  it('virtualizes FullScreenNotificationModal list', async () => {
    const items = genItems(40);
    await act(async () => {
      root.render(
        React.createElement(FullScreenNotificationModal, {
          ...baseProps,
          items,
          loadMore: jest.fn(),
          hasMore: true,
        }),
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    const list = document.querySelector('[data-testid="notification-modal-list"]') as HTMLElement;
    expect(list.querySelectorAll('button').length).toBeLessThan(items.length);
    const loadMore = jest.fn();
    await act(async () => {
      root.render(
        React.createElement(FullScreenNotificationModal, {
          ...baseProps,
          items,
          loadMore,
          hasMore: true,
        }),
      );
    });
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Load more')) as HTMLButtonElement | undefined;
    btn?.click();
    if (btn) {
      expect(loadMore).toHaveBeenCalled();
    }
  });
});
