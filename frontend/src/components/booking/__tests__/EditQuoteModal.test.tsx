import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import EditQuoteModal from '../EditQuoteModal';
import type { Quote } from '@/types';

describe('EditQuoteModal', () => {
  it('renders full screen on mobile', async () => {
    const quote: Quote = {
      id: 1,
      booking_request_id: 2,
      artist_id: 3,
      quote_details: 'Old',
      price: 100,
      currency: 'ZAR',
      status: 'pending_client_action',
      created_at: '',
      updated_at: '',
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

