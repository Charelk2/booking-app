import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import NotificationBell from '../NotificationBell';
import useNotifications from '@/hooks/useNotifications';
import useIsMobile from '@/hooks/useIsMobile';
import { useRouter } from '@/tests/mocks/next-navigation';

jest.mock('@/hooks/useNotifications');
jest.mock('@/hooks/useIsMobile');


function setup() {
  (useNotifications as jest.Mock).mockReturnValue({
    items: [],
    unreadCount: 0,
    markItem: jest.fn(),
    markAll: jest.fn(),
    loadMore: jest.fn(),
    hasMore: false,
  });
  (useIsMobile as jest.Mock).mockReturnValue(false);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

describe('NotificationBell accessibility', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('applies ring styles when keyboard focused', () => {
    const { container, root } = setup();
    act(() => {
      root.render(React.createElement(NotificationBell));
    });
    const button = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      button.focus();
    });
    expect(button.className).toContain('focus-visible:ring-2');
    expect(button.className).toContain('focus-visible:ring-brand');
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('navigates to notification link on click', async () => {
    const push = jest.fn();
    const markItem = jest.fn();
    useRouter.mockReturnValue({ push });
    (useNotifications as jest.Mock).mockReturnValue({
      items: [
        {
          id: 1,
          type: 'new_message',
          message: 'New message',
          link: '/booking-requests/1',
          is_read: false,
          timestamp: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
      markItem,
      markAll: jest.fn(),
      loadMore: jest.fn(),
      hasMore: false,
    });

    const { container, root } = setup();
    await act(async () => {
      root.render(React.createElement(NotificationBell));
    });
    await flushPromises();
    const bell = container.querySelector('button') as HTMLButtonElement;
    await act(async () => {
      bell.click();
    });
    await flushPromises();
    const card = container.querySelector(
      '[data-testid="notification-list"] [role="button"]',
    ) as HTMLElement;
    await act(async () => {
      card.click();
    });

    expect(markItem).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/booking-requests/1');
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
