import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import InboxPage from '../page';
import * as api from '@/lib/api';
import useNotifications from '@/hooks/useNotifications';

jest.mock('@/lib/api');
jest.mock('@/hooks/useNotifications');

function setup(unread = 0) {
  (useNotifications as jest.Mock).mockReturnValue({
    threads: [
      { booking_request_id: 1, name: 'Alice', unread_count: unread, timestamp: new Date().toISOString(), last_message: 'Hi' },
    ],
    loading: false,
    error: null,
    markThread: jest.fn(),
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
    const card = container.querySelector('li div');
    expect(card?.className).toContain('bg-indigo-50');
    expect(container.textContent).not.toContain('new message');
    root.unmount();
    container.remove();
  });
});
