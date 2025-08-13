import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import InlineQuoteForm from '../InlineQuoteForm';
import type { QuoteV2Create } from '@/types';
import { formatCurrency } from '@/lib/utils';

jest.mock('@/lib/api', () => ({
  ...(jest.requireActual('@/lib/api')),
  calculateQuoteBreakdown: jest
    .fn()
    .mockResolvedValue({ data: { travel_cost: 111, sound_cost: 222 } }),
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

  it('triggers onDecline when decline button is clicked', async () => {
    const onDecline = jest.fn();
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <InlineQuoteForm
          artistId={1}
          clientId={2}
          bookingRequestId={3}
          onSubmit={jest.fn()}
          onDecline={onDecline}
        />,
      );
    });

    const declineBtn = Array.from(div.querySelectorAll('button')).find(
      (b) => b.textContent === 'Decline Request',
    ) as HTMLButtonElement | undefined;
    await act(async () => {
      declineBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDecline).toHaveBeenCalledTimes(1);

    root.unmount();
    div.remove();
  });

  it('prefills fees using calculation params', async () => {
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <InlineQuoteForm
          artistId={1}
          clientId={2}
          bookingRequestId={3}
          calculationParams={{
            base_fee: 100,
            distance_km: 10,
            service_id: 1,
            event_city: 'CPT',
          }}
          onSubmit={jest.fn()}
        />,
      );
    });

    // Allow useEffect to run
    await act(async () => {
      await Promise.resolve();
    });

    const spans = Array.from(div.querySelectorAll('span'));
    const travelInput = spans
      .find((s) => s.textContent?.includes('Travel'))
      ?.parentElement?.querySelector('input') as HTMLInputElement;
    const soundInput = spans
      .find((s) => s.textContent?.includes('Sound Equipment'))
      ?.parentElement?.querySelector('input') as HTMLInputElement;

    expect(travelInput?.value).toBe('111');
    expect(soundInput?.value).toBe('222');

    root.unmount();
    div.remove();
  });

  it('displays sound cost tooltip with provided prices', async () => {
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <InlineQuoteForm
          artistId={1}
          clientId={2}
          bookingRequestId={3}
          drivingSoundCost={1000}
          flyingSoundCost={7500}
          onSubmit={jest.fn()}
        />,
      );
    });

    const soundSpan = Array.from(div.querySelectorAll('span')).find((s) =>
      s.textContent?.includes('Sound Equipment'),
    );
    const tooltip = soundSpan?.querySelector('.tooltip');
    expect(tooltip?.textContent).toContain(formatCurrency(1000));
    expect(tooltip?.textContent).toContain(formatCurrency(7500));

    root.unmount();
    div.remove();
  });
});

