import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import NotificationBell from '../NotificationBell';
import useNotifications from '@/hooks/useNotifications';
import useIsMobile from '@/hooks/useIsMobile';

jest.mock('@/hooks/useNotifications');
jest.mock('@/hooks/useIsMobile');

/* eslint-disable @typescript-eslint/no-var-requires */

// eslint-disable-next-line @typescript-eslint/no-var-requires
jest.mock('../NotificationDrawer', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: () => React.createElement('div', { 'data-testid': 'drawer' }),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
jest.mock('../FullScreenNotificationModal', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: () => React.createElement('div', { 'data-testid': 'modal' }),
  };
});

const flushPromises = async () => {
  await act(async () => {});
};

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

describe('NotificationBell prefetch', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders drawer after hover prefetch and open', async () => {
    const { container, root } = setup();
    await act(async () => {
      root.render(React.createElement(NotificationBell));
    });
    await flushPromises();
    const button = container.querySelector('button') as HTMLButtonElement;
    await act(async () => {
      button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    await flushPromises();
    await act(async () => {
      button.click();
    });
    await flushPromises();
    expect(container.querySelector('[data-testid="drawer"]')).not.toBeNull();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders drawer when opened without prefetch', async () => {
    const { container, root } = setup();
    await act(async () => {
      root.render(React.createElement(NotificationBell));
    });
    await flushPromises();
    const button = container.querySelector('button') as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    await flushPromises();
    expect(container.querySelector('[data-testid="drawer"]')).not.toBeNull();
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
