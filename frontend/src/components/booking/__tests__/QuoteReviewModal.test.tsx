import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QuoteReviewModal from '../QuoteReviewModal';
import { QuoteV2 } from '@/types';

describe('QuoteReviewModal', () => {
  const quote: QuoteV2 = {
    id: 1,
    booking_request_id: 1,
    artist_id: 2,
    client_id: 3,
    services: [{ description: 'Performance', price: 100 }],
    sound_fee: 20,
    travel_fee: 30,
    subtotal: 150,
    total: 150,
    status: 'pending',
    created_at: '',
    updated_at: '',
  };

  it('disables buttons and shows spinner on accept', async () => {
    const onAccept = jest.fn(() => Promise.resolve());
    render(
      <QuoteReviewModal
        open
        quote={quote}
        onClose={() => {}}
        onAccept={onAccept}
        onDecline={jest.fn()}
      />,
    );
    const btn = screen.getByText('Accept');
    fireEvent.click(btn);
    expect(btn).toBeDisabled();
    expect(screen.getByTestId('accept-spinner')).toBeInTheDocument();
    await waitFor(() => expect(onAccept).toHaveBeenCalled());
  });

  it('confirms and shows spinner on decline', async () => {
    const onDecline = jest.fn(() => Promise.resolve());
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <QuoteReviewModal
        open
        quote={quote}
        onClose={() => {}}
        onAccept={jest.fn()}
        onDecline={onDecline}
      />,
    );
    const btn = screen.getByText('Decline');
    fireEvent.click(btn);
    expect(confirmSpy).toHaveBeenCalledWith('Are you sure?');
    expect(btn).toBeDisabled();
    expect(screen.getByTestId('decline-spinner')).toBeInTheDocument();
    await waitFor(() => expect(onDecline).toHaveBeenCalled());
    confirmSpy.mockRestore();
  });
});
