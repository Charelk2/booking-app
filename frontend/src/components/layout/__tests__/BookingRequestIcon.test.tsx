import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import BookingRequestIcon from '../BookingRequestIcon';
import useNotifications from '@/hooks/useNotifications.tsx';

jest.mock('@/hooks/useNotifications.tsx');

function setup(unread: number) {
  (useNotifications as jest.Mock).mockReturnValue({
    items: [
      {
        type: 'new_booking_request',
        is_read: unread === 0,
        link: '/booking-requests/1',
        timestamp: new Date().toISOString(),
        content: '',
        id: 1,
      },
    ],
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

describe('BookingRequestIcon', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows unread badge count', () => {
    const { container, root } = setup(1);
    act(() => {
      root.render(<BookingRequestIcon />);
    });
    const badge = container.querySelector('span.bg-red-600');
    expect(badge?.textContent).toBe('1');
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
