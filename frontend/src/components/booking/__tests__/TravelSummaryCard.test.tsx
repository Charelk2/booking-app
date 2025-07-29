import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import TravelSummaryCard from '../TravelSummaryCard';
import { formatCurrency } from '@/lib/utils';

describe('TravelSummaryCard', () => {
  it('shows flight subtotal and traveller count', () => {
    const div = document.createElement('div');
    const root = createRoot(div);
    act(() => {
      root.render(
        <TravelSummaryCard
          result={{
            mode: 'fly',
            totalCost: 5560,
            breakdown: {
              drive: { estimate: 0 },
              fly: {
                perPerson: 2780,
                travellers: 2,
                flightSubtotal: 5560,
                carRental: 0,
                localTransferKm: 0,
                departureTransferKm: 0,
                transferCost: 0,
                total: 5560,
              },
            },
          }}
        />,
      );
    });
    expect(div.textContent).toContain('Flights:');
    expect(div.textContent).toContain(formatCurrency(5560));
    expect(div.textContent).toContain('avg price for 2 travelling members');
    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
