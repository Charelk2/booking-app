import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import EventPrepCard from '../EventPrepCard';

let wsHandler: ((e: MessageEvent) => void) | null = null;

jest.mock('@/hooks/useWebSocket', () => ({
  __esModule: true,
  default: () => ({
    onMessage: (h: any) => { wsHandler = h; return () => { wsHandler = null; }; },
    send: () => {},
    updatePresence: () => {},
  }),
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
  updateEventPrep: jest.fn(),
}));

function dispatchWs(payload: any) {
  if (!wsHandler) throw new Error('no ws handler');
  const evt = { data: JSON.stringify(payload) } as MessageEvent;
  wsHandler(evt);
}

describe('EventPrepCard WS integration', () => {
  it('merges event_prep_updated payload into state', async () => {
    render(
      <EventPrepCard bookingId={123} bookingRequestId={456} canEdit={false} /> as any
    );

    await waitFor(() => expect(screen.getByText(/Prep/)).toBeInTheDocument());
    // Initially unchecked
    const power = screen.getByLabelText('Stage power confirmed') as HTMLInputElement;
    expect(power.checked).toBe(false);

    // Simulate WS toggle
    dispatchWs({ type: 'event_prep_updated', payload: { booking_id: 123, stage_power_confirmed: true, progress_done: 3, progress_total: 6 } });

    await waitFor(() => expect((screen.getByLabelText('Stage power confirmed') as HTMLInputElement).checked).toBe(true));
  });
});

