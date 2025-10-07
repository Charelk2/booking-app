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
    progress_done: 2,
    progress_total: 6,
  })),
}));

describe('EventPrepCard', () => {
  it('renders summary with progress and supports click-through', async () => {
    const onContinue = jest.fn();
    render(
      <EventPrepCard
        bookingId={123}
        bookingRequestId={456}
        canEdit
        summaryOnly
        eventDateISO={'2099-01-01T00:00:00.000Z'}
        onContinuePrep={onContinue}
      /> as any
    );
    await waitFor(() => expect(screen.getByText('Let’s prep your event')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/Prep 2\/6/)).toBeInTheDocument());
    // Days chip present
    expect(screen.getByText(/In \d+ days/)).toBeInTheDocument();

    const card = screen.getByRole('button', { name: /Event preparation/i });
    fireEvent.click(card);
    expect(onContinue).toHaveBeenCalledWith(123);
  });
});
