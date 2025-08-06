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
            from: 'Client',
            receivedAt: 'Aug 6, 2025',
            event: 'Birthday',
          }}
          onSubmit={onSubmit}
        />,
      );
    });

    const btn = div.querySelector('button');
    await act(async () => {
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const data: QuoteV2Create = onSubmit.mock.calls[0][0];
    expect(data.services[0]).toEqual({ description: 'Test Service', price: 100 });
    expect(data.travel_fee).toBe(50);
    expect(data.sound_fee).toBe(0);

    root.unmount();
    div.remove();
  });

  it('shows event details', async () => {
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <InlineQuoteForm
          artistId={1}
          clientId={2}
          bookingRequestId={3}
          eventDetails={{
            from: 'Client',
            receivedAt: 'Aug 6, 2025',
            event: 'Wedding',
            guests: 50,
          }}
          onSubmit={() => {}}
        />,
      );
    });

    expect(div.textContent).toContain('Aug 6, 2025');
    expect(div.textContent).toContain('Wedding');
    expect(div.textContent).toContain('50');

    root.unmount();
    div.remove();
  });
});

