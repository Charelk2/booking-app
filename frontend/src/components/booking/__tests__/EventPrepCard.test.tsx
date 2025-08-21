import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import EventPrepCard from '../EventPrepCard';

jest.mock('@/hooks/useWebSocket', () => ({
  __esModule: true,
  default: () => ({ onMessage: () => () => {}, send: () => {}, updatePresence: () => {} }),
}));

jest.mock('@/lib/api', () => ({
  __esModule: true,
  getEventPrep: jest.fn(async () => ({
    booking_id: 123,
    day_of_contact_name: null,
    day_of_contact_phone: null,
    venue_address: 'Cape Town, ZA',
    venue_lat: null,
    venue_lng: null,
    loadin_start: null,
    loadin_end: null,
    tech_owner: 'venue',
    stage_power_confirmed: false,
    accommodation_required: false,
    notes: '',
    progress_done: 2,
    progress_total: 6,
  })),
  updateEventPrep: jest.fn(async (_id: number, patch: any) => ({
    booking_id: 123,
    day_of_contact_name: patch.day_of_contact_name ?? null,
    day_of_contact_phone: patch.day_of_contact_phone ?? null,
    venue_address: 'Cape Town, ZA',
    venue_lat: null,
    venue_lng: null,
    loadin_start: patch.loadin_start ?? null,
    loadin_end: patch.loadin_end ?? null,
    tech_owner: patch.tech_owner ?? 'venue',
    stage_power_confirmed: !!patch.stage_power_confirmed,
    accommodation_required: false,
    notes: patch.notes ?? '',
    progress_done: 3,
    progress_total: 6,
  })),
}));

describe('EventPrepCard', () => {
  it('renders and saves contact', async () => {
    render(
      <EventPrepCard
        bookingId={123}
        bookingRequestId={456}
        canEdit
      /> as any
    );
    await waitFor(() => expect(screen.getByText(/Prep \d+\/\d+/)).toBeInTheDocument());

    const name = screen.getByPlaceholderText('Full name') as HTMLInputElement;
    const phone = screen.getByPlaceholderText('Mobile') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Mariaan' } });
    fireEvent.change(phone, { target: { value: '+27 555' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText(/Saved: Mariaan/)).toBeInTheDocument());
  });
});

