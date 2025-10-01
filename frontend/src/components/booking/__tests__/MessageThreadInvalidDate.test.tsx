import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import MessageThread from '../MessageThread';
import * as api from '@/lib/api';
import { useRouter } from '@/tests/mocks/next-navigation';
import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';

const makeEnvelope = (items: any[] = []) => ({
  data: {
    mode: 'full' as const,
    items,
    has_more: false,
    next_cursor: null,
    delta_cursor: null,
    requested_after_id: null,
    requested_since: null,
    total_latency_ms: 0,
    db_latency_ms: 0,
    payload_bytes: 0,
  },
});

jest.mock('@/lib/api');
jest.mock('@/hooks/useWebSocket', () => ({
  __esModule: true,
  default: () => ({ send: jest.fn(), onMessage: jest.fn() }),
}));

interface EventDetails {
  date?: string;
}

let receivedEventDetails: EventDetails | undefined;
jest.mock('../QuoteBubble', () => {
  const MockQuoteBubble = ({ eventDetails }: { eventDetails: EventDetails }) => {
    receivedEventDetails = eventDetails;
    return <div data-testid="quote-bubble" />;
  };
  MockQuoteBubble.displayName = 'MockQuoteBubble';
  return MockQuoteBubble;
});

beforeAll(() => {
  window.HTMLElement.prototype.scrollTo = jest.fn();
});

function flushPromises() {
  return new Promise((res) => setTimeout(res, 0));
}

describe('MessageThread booking details with invalid date', () => {
  it('renders quote bubble when booking details contain invalid date', async () => {
    (api.useAuth as jest.Mock).mockReturnValue({ user: { id: 7, user_type: 'client' } });
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue(
      makeEnvelope([
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 9,
          sender_type: 'system',
          content: `${BOOKING_DETAILS_PREFIX}\nDate: not-a-date`,
          message_type: 'SYSTEM',
          is_read: true,
          timestamp: '2025-01-01T00:00:00Z',
        },
        {
          id: 2,
          booking_request_id: 1,
          sender_id: 9,
          sender_type: 'artist',
          content: 'Quote message',
          message_type: 'QUOTE',
          quote_id: 42,
          is_read: true,
          timestamp: '2025-01-01T00:00:00Z',
        },
      ]),
    );
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

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<MessageThread bookingRequestId={1} />);
    });
    await act(async () => { await flushPromises(); });
    await act(async () => { await flushPromises(); });
    await act(async () => { await flushPromises(); });

    expect(receivedEventDetails?.date).toBeUndefined();

    act(() => root.unmount());
    container.remove();
  });
});
