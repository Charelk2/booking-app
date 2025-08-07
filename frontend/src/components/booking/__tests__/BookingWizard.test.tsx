import { render, screen, act } from '@testing-library/react';
import React from 'react';
import BookingWizard from '../BookingWizard';
import { BookingProvider, useBooking } from '@/contexts/BookingContext';
import { useAuth } from '@/contexts/AuthContext';
import * as api from '@/lib/api';
import * as geo from '@/lib/geo';
import * as travel from '@/lib/travel';
import { formatCurrency } from '@/lib/utils';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('@/lib/geo');
jest.mock('@/lib/travel');

function ExposeSetter() {
  const { setStep, setDetails } = useBooking();
  (window as unknown as { __setStep: (s: number) => void }).__setStep = setStep;
  (window as unknown as { __setDetails: (d: any) => void }).__setDetails = setDetails as (d: any) => void;
  return null;
}

function Wrapper() {
  return (
    <BookingProvider>
      <ExposeSetter />
      <BookingWizard artistId={1} serviceId={1} isOpen onClose={() => {}} />
    </BookingProvider>
  );
}

describe('BookingWizard instructions', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 1 } });
    (api.getArtistAvailability as jest.Mock).mockResolvedValue({
      data: { unavailable_dates: [] },
    });
    (api.getArtist as jest.Mock).mockResolvedValue({
      data: { location: 'NYC' },
    });
    (api.getService as jest.Mock).mockResolvedValue({
      data: {
        price: 'R100',
        travel_rate: 2.5,
        travel_members: 1,
        car_rental_price: 0,
        flight_price: 0,
      },
    });
    (api.calculateQuote as jest.Mock).mockResolvedValue({ data: { total: 100 } });
    (geo.geocodeAddress as jest.Mock).mockResolvedValue({ lat: 0, lng: 0 });
    (travel.getDrivingMetrics as jest.Mock).mockResolvedValue({ distanceKm: 10, durationHrs: 1 });
    (travel.calculateTravelMode as jest.Mock).mockResolvedValue({
      mode: 'drive',
      totalCost: 0,
      breakdown: { drive: { estimate: 0 } },
    });
  });

  it('shows first step instruction', () => {
    render(<Wrapper />);
    expect(document.body.textContent).toContain('Tell us a little bit more about your event.');

  });

  it('displays service base price in review step', async () => {
    render(<Wrapper />);

    // Allow initial effects to run
    await act(async () => {});

    await act(async () => {
      (window as unknown as { __setDetails: (d: any) => void }).__setDetails({
        eventType: 'Party',
        eventDescription: 'Fun',
        date: new Date(),
        time: '18:00',
        location: 'Cape Town',
        guests: '10',
        venueType: 'indoor',
        sound: 'no',
        notes: '',
        attachment_url: '',
      });
      (window as unknown as { __setStep: (s: number) => void }).__setStep(8);
    });

      expect(await screen.findByText('Artist Base Fee')).toBeTruthy();
      expect(document.body.textContent).toContain(formatCurrency(100));
    });

  });
