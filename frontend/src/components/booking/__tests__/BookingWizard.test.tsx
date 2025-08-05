import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import BookingWizard from '../BookingWizard';
import { BookingProvider, useBooking } from '@/contexts/BookingContext';
import { useAuth } from '@/contexts/AuthContext';
import * as api from '@/lib/api';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');

function ExposeSetter() {
  const { setStep } = useBooking();
  (window as unknown as { __setStep: (s: number) => void }).__setStep = setStep;
  return null;
}

function Wrapper() {
  return (
    <BookingProvider>
      <ExposeSetter />
      <BookingWizard artistId={1} isOpen onClose={() => {}} />
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
  });

  it('shows first step instruction', () => {
    render(<Wrapper />);
    expect(document.body.textContent).toContain('Tell us a little bit more about your event.');

  });

});
