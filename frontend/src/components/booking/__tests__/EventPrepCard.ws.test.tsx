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
    progress_done: 2,
    progress_total: 6,
  })),
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

    await waitFor(() => expect(screen.getByText(/Prep 2\/6/)).toBeInTheDocument());

    // Simulate WS progress update
    dispatchWs({ type: 'event_prep_updated', payload: { booking_id: 123, progress_done: 3, progress_total: 6 } });

    await waitFor(() => expect(screen.getByText(/Prep 3\/6/)).toBeInTheDocument());
  });
});
