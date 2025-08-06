import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import InlineQuoteForm from '../InlineQuoteForm';
import type { QuoteV2Create } from '@/types';

jest.mock('@/lib/api', () => ({
  getQuoteTemplates: jest.fn(() => Promise.resolve({ data: [] })),
}));

describe('InlineQuoteForm', () => {
  it('submits quote data with defaults', async () => {
    const onSubmit = jest.fn();
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <InlineQuoteForm
          artistId={1}
          clientId={2}
          bookingRequestId={3}
          serviceName="Test Service"
          initialBaseFee={100}
          initialTravelCost={50}
          eventDetails={{
            from: 'Chris',
            receivedAt: 'Aug 6, 2025',
            event: 'Birthday',
            guests: '100',
            venue: 'indoor',
            notes: 'N/A',
          }}
          onSubmit={onSubmit}
        />,
      );
    });

    const btn = Array.from(div.querySelectorAll('button')).find(
      (b) => b.textContent === 'Send Quote',
    ) as HTMLButtonElement | undefined;
    await act(async () => {
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const data: QuoteV2Create = onSubmit.mock.calls[0][0];
    expect(data.services[0]).toEqual({ description: 'Test Service', price: 100 });
    expect(data.travel_fee).toBe(50);
    expect(data.sound_fee).toBe(0);
    expect(div.textContent).toContain('Event Details');
    expect(div.textContent).toContain('Birthday');

    root.unmount();
    div.remove();
  });
});

