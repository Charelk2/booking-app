import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

jest.mock('@/lib/api', () => ({
  ...(jest.requireActual('@/lib/api')),
  livePerformanceEstimate: jest
    .fn()
    .mockResolvedValue({ data: { base_fee: 100, travel_cost: 50, sound_cost: 20 } }),
  getBookingRequestCached: jest.fn().mockResolvedValue({
    id: 1,
    service_id: null,
    service: { price: null, details: {} },
    travel_breakdown: {
      sound_required: false,
      distance_km: undefined,
    },
    event_city: 'CPT',
    parent_booking_request_id: 0,
  }),
  getService: jest.fn().mockResolvedValue({ data: { price: null } }),
}));

import { livePerformanceEstimate } from '@/lib/api';
import { useLiveQuotePrefill } from './useLiveQuotePrefill';

describe('useLiveQuotePrefill', () => {
  it('uses livePerformanceEstimate and applies results from calculationParams', async () => {
    const rootEl = document.createElement('div');
    const root = createRoot(rootEl);

    const mockedLiveEstimate = livePerformanceEstimate as unknown as jest.Mock;

    function TestComponent() {
      const [serviceFee, setServiceFee] = React.useState(0);
      const [travelFee, setTravelFee] = React.useState(0);
      const [soundFee, setSoundFee] = React.useState(0);

      useLiveQuotePrefill({
        bookingRequestId: 1,
        dirtyService: false,
        dirtyTravel: false,
        dirtySound: false,
        initialBaseFee: undefined,
        initialTravelCost: undefined,
        initialSoundNeeded: undefined,
        initialSoundCost: undefined,
        calculationParams: {
          base_fee: 200,
          distance_km: 10,
          service_id: 7,
          event_city: 'Cape Town',
        },
        setServiceFee,
        setTravelFee,
        setSoundFee,
        setIsSupplierParent: jest.fn(),
        setLoadingCalc: jest.fn(),
      });

      return (
        <div>
          <span data-testid="service-fee">{serviceFee}</span>
          <span data-testid="travel-fee">{travelFee}</span>
          <span data-testid="sound-fee">{soundFee}</span>
        </div>
      );
    }

    await act(async () => {
      root.render(<TestComponent />);
    });

    // Allow async effects to resolve
    await act(async () => {
      await Promise.resolve();
    });

    const serviceFeeEl = rootEl.querySelector('[data-testid="service-fee"]') as HTMLSpanElement;
    const travelFeeEl = rootEl.querySelector('[data-testid="travel-fee"]') as HTMLSpanElement;
    const soundFeeEl = rootEl.querySelector('[data-testid="sound-fee"]') as HTMLSpanElement;

    expect(serviceFeeEl?.textContent).toBe('100');
    expect(travelFeeEl?.textContent).toBe('50');
    expect(soundFeeEl?.textContent).toBe('20');

    expect(mockedLiveEstimate).toHaveBeenCalledWith(
      expect.objectContaining({
        base_fee: 200,
        distance_km: 10,
        service_id: 7,
        event_city: 'Cape Town',
      }),
    );

    act(() => {
      root.unmount();
    });
  });
});
