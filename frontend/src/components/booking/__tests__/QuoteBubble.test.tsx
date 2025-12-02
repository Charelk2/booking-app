import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import QuoteBubble from '@/components/chat/QuoteBubble';

describe('QuoteBubble', () => {
  it('matches snapshot', () => {
    const div = document.createElement('div');
    const root = createRoot(div);

    act(() => {
      root.render(
        <QuoteBubble
          description="Performance"
          price={100}
          soundFee={10}
          travelFee={20}
          accommodation="0.00"
          discount={5}
          subtotal={125}
          total={130}
          totalsPreview={{ providerSubtotal: 125, platformFeeExVat: 3.75, platformFeeVat: 0.56, clientTotalInclVat: 134.31 }}
          status="Pending"
          eventDetails={{
            from: 'Client Name',
            receivedAt: 'Jul 30, 2025',
            event: 'Wedding Reception',
            date: 'Oct 26, 2025',
            guests: '~120',
            venue: 'Molenvliet',
            notes: 'Client requests a specific song for the first dance.',
          }}
          expiresAt="2025-08-01T00:00:00Z"
          onAccept={() => {}}
          onDecline={() => {}}
        />, 
      );
    });

    expect(div.firstChild).toMatchSnapshot();

    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
