import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import QuoteCard from '../QuoteCard';
import { formatCurrency } from '@/lib/utils';

const baseQuote = {
  id: 1,
  booking_request_id: 1,
  artist_id: 2,
  client_id: 1,
  services: [{ description: 'Perf', price: 100 }],
  sound_fee: 10,
  travel_fee: 20,
  accommodation: null,
  subtotal: 130,
  discount: null,
  total: 130,
  status: 'pending' as const,
  created_at: '',
  updated_at: '',
};

describe('QuoteCard', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    jest.useRealTimers();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders service items and buttons', () => {
    act(() => {
      root.render(
        <QuoteCard
          quote={baseQuote}
          isClient
          onAccept={() => {}}
          onDecline={() => {}}
          bookingConfirmed={false}
        />,
      );
    });
    expect(container.textContent).toContain('Perf');
    expect(container.textContent).toContain(formatCurrency(100));
    expect(container.textContent).toContain(formatCurrency(130));
  });

  it('shows countdown for pending quote', () => {
    jest.setSystemTime(new Date('2025-01-01T12:00:00Z'));
    const quote = {
      ...baseQuote,
      expires_at: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
    };
    act(() => {
      root.render(
        <QuoteCard
          quote={quote}
          isClient
          onAccept={() => {}}
          onDecline={() => {}}
          bookingConfirmed={false}
        />,
      );
    });
    let span = container.querySelector('[data-testid="expires-countdown"]');
    expect(span?.textContent).toMatch(/Expires in 1d 2h/);
    act(() => {
      jest.advanceTimersByTime(60 * 60 * 1000);
    });
    span = container.querySelector('[data-testid="expires-countdown"]');
    expect(span?.textContent).toMatch(/Expires in 1d 1h/);
  });

  it('applies warning style when under 24h left', () => {
    jest.setSystemTime(new Date('2025-01-01T12:00:00Z'));
    const quote = {
      ...baseQuote,
      expires_at: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(),
    };
    act(() => {
      root.render(
        <QuoteCard
          quote={quote}
          isClient
          onAccept={() => {}}
          onDecline={() => {}}
          bookingConfirmed={false}
        />,
      );
    });
    const span = container.querySelector('[data-testid="expires-countdown"]') as HTMLElement;
    expect(span.className).toContain('text-orange-600');
  });
});
