import React from 'react';
import { createRoot } from 'react-dom/client';
import QuoteCard from '../QuoteCard';
import { act } from 'react';
import { formatCurrency } from '@/lib/utils';

const quote = {
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
  status: 'pending',
  created_at: '',
  updated_at: '',
};

describe('QuoteCard', () => {
  it('renders service items and buttons', () => {
    const div = document.createElement('div');
    const root = createRoot(div);
    act(() => {
      root.render(
        <QuoteCard quote={quote} isClient onAccept={() => {}} onDecline={() => {}} bookingConfirmed={false} />,
      );
    });
    expect(div.textContent).toContain('Perf');
    expect(div.textContent).toContain(formatCurrency(100));
    expect(div.textContent).toContain(formatCurrency(130));
  });
});
