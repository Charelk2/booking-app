import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import EditQuoteModal from '../EditQuoteModal';
import type { QuoteV2 } from '@/types';

describe('EditQuoteModal', () => {
  it('renders full screen on mobile', async () => {
    const quote: QuoteV2 = {
      id: 1,
      booking_request_id: 2,
      artist_id: 3,
      client_id: 4,
      services: [{ description: 'Old', price: 100 }],
      sound_fee: 0,
      travel_fee: 0,
      subtotal: 100,
      total: 100,
      status: 'pending',
      created_at: '',
      updated_at: '',
      quote_details: 'Old',
    };

    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <EditQuoteModal open quote={quote} onClose={() => {}} onSubmit={async () => {}} />,
      );
    });

    const sheet = div.querySelector('[data-testid="edit-quote-modal"]');
    expect(sheet?.querySelector('.h-screen')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
