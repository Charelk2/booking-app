import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import InboxPage from '../page';
import * as api from '@/lib/api';
import useNotifications from '@/hooks/useNotifications';
import { useRouter } from 'next/navigation';

jest.mock('@/lib/api');
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
      },
    ],
    loading: false,
    error: null,
    markItem: jest.fn(),
  });
  (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
    data: [
      {
        id: 1,
        booking_request_id: 1,
        sender_id: 2,
        sender_type: 'artist',
        content: 'Booking details:\nLocation: Test',
        message_type: 'system',
        timestamp: new Date().toISOString(),
      },
    ],
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
    // wait for the InboxPage effect that fetches booking details
    await act(async () => {
      await Promise.resolve();
    });
    const card = container.querySelector('li div');
    expect(card?.className).toContain('bg-indigo-50');
    expect(container.textContent).not.toContain('new message');
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

  it.skip('opens booking request detail when card clicked', async () => {
    const push = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push, pathname: '/inbox' });
    const { container, root } = setup();
    await act(async () => {
      root.render(<InboxPage />);
    });
    await act(async () => {});
    const card = container.querySelector('li div') as HTMLDivElement;
    await act(async () => {
      card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(push).toHaveBeenCalledWith('/booking-requests/1');
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
