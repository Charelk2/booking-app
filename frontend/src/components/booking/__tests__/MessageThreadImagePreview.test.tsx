import { render, fireEvent } from '@testing-library/react';
import MessageThread from '../MessageThread';
import * as api from '@/lib/api';

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

jest.mock('@/hooks/useWebSocket', () => () => ({ send: jest.fn(), onMessage: jest.fn(), updatePresence: jest.fn() }));
jest.mock('@/lib/api');

function flushPromises() {
  return new Promise((res) => setTimeout(res, 0));
}

describe('MessageThread image attachments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'client', email: 'c@example.com' } });
    (api.getQuoteV2 as jest.Mock).mockResolvedValue({ data: null });
    (api.getBookingDetails as jest.Mock).mockResolvedValue({
      data: { id: 1, service: { title: 'Gig' }, start_time: '2024-01-01T00:00:00Z' },
    });
    (api as any).defaults = { baseURL: 'http://localhost:8000' };
  });

  it('renders image preview and opens modal on click', async () => {
    (api.getMessagesForBookingRequest as jest.Mock).mockResolvedValue(
      makeEnvelope([
        {
          id: 1,
          booking_request_id: 1,
          sender_id: 1,
          sender_type: 'client',
          content: '',
          attachment_url: '/static/attachments/pic.jpg',
          is_read: true,
          timestamp: '2025-01-01T00:00:00Z',
        },
      ]),
    );

    const { findByAltText, queryByRole } = render(<MessageThread bookingRequestId={1} />);
    const img = await findByAltText('Image attachment');
    expect(img).toBeInTheDocument();

    expect(queryByRole('dialog')).toBeNull();
    fireEvent.click(img);
    await flushPromises();
    expect(queryByRole('dialog')).not.toBeNull();
  });
});
