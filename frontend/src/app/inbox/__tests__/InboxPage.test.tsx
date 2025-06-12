import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { waitFor } from '@testing-library/react';
import InboxPage from '../page';
import useNotifications from '@/hooks/useNotifications';
import { useRouter } from 'next/navigation';

jest.mock('@/hooks/useNotifications', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/inbox'),
}));
jest.mock('@/components/layout/MainLayout', () => {
  const Mock = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Mock.displayName = 'MockMainLayout';
  return Mock;
});
jest.mock('@/components/layout/NotificationBell', () => {
  const Bell = () => <div />;
  Bell.displayName = 'MockNotificationBell';
  return Bell;
});

function setup(unread = 0) {
  (useNotifications as jest.Mock).mockReturnValue({
    items: [
      {
        type: 'message',
        booking_request_id: 1,
        name: 'Alice',
        unread_count: unread,
        timestamp: new Date().toISOString(),
        content: 'Hi',
        is_read: unread === 0,
        booking_details: {
          timestamp: new Date().toISOString(),
          location: 'Test',
        },
      },
    ],
    loading: false,
    error: null,
    markItem: jest.fn(),
  });

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

describe('InboxPage unread badge', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('highlights unread booking requests', async () => {
    const { container, root } = setup(2);
    await act(async () => {
      root.render(<InboxPage />);
    });
    const card = container.querySelector('li div');
    expect(card?.className).toContain('bg-indigo-50');
    const badge = container.querySelector('span.bg-red-600');
    expect(badge?.textContent).toBe('2');
    const dot = container.querySelector('span[aria-label="Unread messages"]');
    expect(dot).not.toBeNull();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('does not show unread dot for read threads', async () => {
    const { container, root } = setup(0);
    await act(async () => {
      root.render(<InboxPage />);
    });
    const dot = container.querySelector('span[aria-label="Unread messages"]');
    expect(dot).toBeNull();
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

describe('InboxPage navigation', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('opens booking request detail when card clicked', async () => {
    const push = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push, pathname: '/inbox' });
    const { container, root } = setup();

    await act(async () => {
      root.render(<InboxPage />);
    });

    const card = container.querySelector('li div') as HTMLDivElement;

    await act(async () => {
      card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/booking-requests/1');
    });

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
