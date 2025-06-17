import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import ArtistQuotesPage from '../page';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/dashboard/quotes'),
}));

describe('ArtistQuotesPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders quotes and triggers actions', async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'artist', email: 'a@example.com' } });
    (api.getMyArtistQuotes as jest.Mock).mockResolvedValue({
      data: [
        { id: 1, booking_request_id: 9, artist_id: 2, quote_details: 'Offer', price: 100, currency: 'ZAR', status: 'pending_client_action', created_at: '', updated_at: '' },
        { id: 2, booking_request_id: 9, artist_id: 2, quote_details: 'Accepted', price: 120, currency: 'ZAR', status: 'accepted_by_client', created_at: '', updated_at: '' },
      ],
    });
    (api.updateQuoteAsArtist as jest.Mock).mockResolvedValue({ data: {} });
    (api.confirmQuoteBooking as jest.Mock).mockResolvedValue({ data: {} });

    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);

    await act(async () => {
      root.render(<ArtistQuotesPage />);
    });
    await act(async () => { await Promise.resolve(); });

    const withdrawBtn = Array.from(div.querySelectorAll('button')).find(b => b.textContent === 'Withdraw') as HTMLButtonElement;
    expect(withdrawBtn).toBeTruthy();
    await act(async () => {
      withdrawBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(api.updateQuoteAsArtist).toHaveBeenCalledWith(1, { status: 'withdrawn_by_artist' });

    const confirmBtn = Array.from(div.querySelectorAll('button')).find(b => b.textContent === 'Confirm Booking') as HTMLButtonElement;
    expect(confirmBtn).toBeTruthy();
    await act(async () => {
      confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(api.confirmQuoteBooking).toHaveBeenCalledWith(2);

    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
