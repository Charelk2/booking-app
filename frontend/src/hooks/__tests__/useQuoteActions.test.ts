import { useAcceptQuote, useDeclineQuote, useSendQuote } from '../useQuoteActions';
import type { QuoteV2Create } from '@/types';

describe('quote action hooks', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
      status: 200,
    });
  });

  it('sends correct payload when sending a quote', async () => {
    const sendQuote = useSendQuote();
    const payload: QuoteV2Create = {
      booking_request_id: 1,
      artist_id: 2,
      client_id: 3,
      services: [],
      sound_fee: 0,
      travel_fee: 0,
    };
    await sendQuote(payload);
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/quotes', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('posts to accept endpoint with service id', async () => {
    const acceptQuote = useAcceptQuote();
    await acceptQuote(5, 7);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/quotes/5/accept?service_id=7',
      {
        method: 'POST',
        body: '{}',
        headers: { 'Content-Type': 'application/json' },
      },
    );
  });

  it('posts to decline endpoint', async () => {
    const declineQuote = useDeclineQuote();
    await declineQuote(9);
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/quotes/9/decline', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
    });
  });
});
