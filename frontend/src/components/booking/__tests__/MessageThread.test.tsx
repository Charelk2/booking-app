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
  it('opens review modal from system message and renders no quote bubble', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 7, user_type: 'client' } });
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    // @ts-ignore: mock API functions
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 9,
          sender_type: 'artist',
          content: 'Review & Accept Quote',
          message_type: 'system',
          visible_to: 'client',
          action: 'review_quote',
          quote_id: 42,
          is_read: true,
          timestamp: '2025-01-01T00:00:00Z',
        },
        {
          id: 2,
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

    // quote messages should render as plain text, no bubble container
    expect(container.querySelector('#quote-42')).toBeNull();
    expect(container.textContent).toContain('Quote message');

    const button = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Review & Accept Quote',
    );
    expect(button).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
