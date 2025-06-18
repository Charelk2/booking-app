import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import NotificationBell from '../NotificationBell';
import useNotifications from '@/hooks/useNotifications';
import useIsMobile from '@/hooks/useIsMobile';

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
});
