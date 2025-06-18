import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import EditQuoteModal from '@/components/booking/EditQuoteModal';
import type { Quote } from '@/types';

describe('EditQuoteModal', () => {
  it('prefills and submits updates', async () => {
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
    const onSubmit = jest.fn();
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <EditQuoteModal open={true} quote={quote} onClose={() => {}} onSubmit={onSubmit} />,
      );
    });
    const textarea = div.querySelector('textarea') as HTMLTextAreaElement;
    const input = div.querySelector('input[type="number"]') as HTMLInputElement;
    expect(textarea.value).toBe('Old');
    expect(input.value).toBe('100');
    await act(async () => {
      textarea.value = 'New details';
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      input.value = '150';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const form = div.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    });
    expect(onSubmit).toHaveBeenCalledWith({ quote_details: 'New details', price: 150 });
    root.unmount();
  });
});
