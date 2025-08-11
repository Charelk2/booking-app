import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import ReviewStep from '../ReviewStep';
import { useBooking } from '@/contexts/BookingContext';
import { calculateQuote, getService } from '@/lib/api';
import { geocodeAddress } from '@/lib/geo';
import { calculateTravelMode, getDrivingMetrics } from '@/lib/travel';

jest.mock('@/contexts/BookingContext');
jest.mock('@/lib/api');
jest.mock('@/lib/geo');
jest.mock('@/lib/travel');

describe('ReviewStep summary', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (getService as jest.Mock).mockResolvedValue({ data: { price: 100, car_rental_price: 1000, flight_price: 2780 } });
    (calculateQuote as jest.Mock).mockResolvedValue({ total: 150 });
    (geocodeAddress as jest.Mock).mockResolvedValue({ lat: 0, lng: 0 });
    (getDrivingMetrics as jest.Mock).mockResolvedValue({ distanceKm: 10, durationHrs: 1 });
    (calculateTravelMode as jest.Mock).mockResolvedValue({
      mode: 'drive',
      totalCost: 100,
      breakdown: {
        drive: { estimate: 100 },
        fly: {
          perPerson: 2780,
          travellers: 1,
          flightSubtotal: 0,
          carRental: 1000,
          localTransferKm: 0,
          departureTransferKm: 0,
          transferCost: 0,
          total: 0,
        },
      },
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
  });

  it('renders single summary and price', async () => {
    (useBooking as jest.Mock).mockReturnValue({
      details: { location: 'a', eventType: 'Party', eventDescription: 'Fun' },
      travelResult: null,
      setTravelResult: jest.fn(),
    });
    await act(async () => {
      root.render(
        <ReviewStep
          step={0}
          steps={['Review']}
          onBack={() => {}}
          onSaveDraft={async () => {}}
          onNext={async () => {}}
          submitting={false}
          serviceId={1}
          artistLocation="b"
        />,
      );
    });
    expect(container.querySelectorAll('h3').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('Estimated Cost');
    expect(container.textContent).toContain('Travel');
  });

  it('shows fuel cost when travel mode is fly', async () => {
    (useBooking as jest.Mock).mockReturnValue({
      details: { sound: 'no' },
      travelResult: null,
      setTravelResult: jest.fn(),
    });

    await act(async () => {
      root.render(
        <ReviewStep
          isLoadingReviewData={false}
          reviewDataError={null}
          step={0}
          steps={['Review']}
          onBack={() => {}}
          onSaveDraft={async () => {}}
          onNext={async () => {}}
          submitting={false}
          baseServicePrice={0}
          travelResult={{
            mode: 'fly',
            totalCost: 150,
            breakdown: {
              drive: { estimate: 0 },
              fly: {
                perPerson: 100,
                travellers: 1,
                flightSubtotal: 100,
                carRental: 0,
                localTransferKm: 0,
                departureTransferKm: 0,
                transferCost: 50,
                total: 150,
              },
            },
          }}
        />,
      );
    });

    expect(container.textContent).toContain('Fuel');
  });
});
