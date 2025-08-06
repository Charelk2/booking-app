import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import MessageThread from '../MessageThread';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));
jest.mock('@/hooks/useWebSocket', () => ({
  __esModule: true,
  default: () => ({ send: jest.fn(), onMessage: jest.fn() }),
}));

beforeAll(() => {
  window.HTMLElement.prototype.scrollTo = jest.fn();
});

function flushPromises() {
  return new Promise((res) => setTimeout(res, 0));
}

describe('MessageThread quote actions', () => {
  it('lets clients open quote review from the quote bubble', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 7, user_type: 'client' } });
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 9,
          sender_type: 'artist',
          content: 'Quote message',
          message_type: 'quote',
          quote_id: 42,
          is_read: true,
          timestamp: '2025-01-01T00:00:00Z',
        },
      ],
    });
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({
      data: {
        id: 42,
        services: [{ description: 'Performance', price: 100 }],
        sound_fee: 0,
        travel_fee: 0,
        subtotal: 100,
        total: 100,
        status: 'pending',
      },
    });
    (api.acceptQuoteV2 as jest.Mock).mockResolvedValue({ data: { id: 1 } });
    (api.getBookingDetails as jest.Mock).mockResolvedValue({ data: { id: 99, deposit_amount: 50 } });

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MessageThread
          bookingRequestId={1}
          showQuoteModal={false}
          setShowQuoteModal={jest.fn()}
        />,
      );
    });
    await act(async () => { await flushPromises(); });
    await act(async () => { await flushPromises(); });

    const bubbleButton = container.querySelector('#quote-42 button');
    expect(bubbleButton?.textContent).toBe('Review & Accept Quote');

    (api.getQuoteV2 as jest.Mock).mockResolvedValue({
      data: {
        id: 42,
        booking_request_id: 1,
        artist_id: 9,
        client_id: 7,
        services: [{ description: 'Performance', price: 100 }],
        sound_fee: 0,
        travel_fee: 0,
        subtotal: 100,
        total: 100,
        status: 'pending',
        created_at: '',
        updated_at: '',
      },
    });

    act(() => {
      bubbleButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => { await flushPromises(); });

    expect(api.getQuoteV2).toHaveBeenCalledWith(42);
    expect(container.textContent).toContain('Quote Review');

    act(() => root.unmount());
    container.remove();
  });
});
