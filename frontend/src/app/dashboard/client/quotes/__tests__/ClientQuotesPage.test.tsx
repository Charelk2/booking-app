import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import ClientQuotesPage from '../page';
import { getMyClientQuotes } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/dashboard/client/quotes'),
}));

describe('ClientQuotesPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders client quotes list', async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 1, user_type: 'client', email: 'c@example.com' },
    });
    (getMyClientQuotes as jest.Mock).mockResolvedValue({
      data: [
        { id: 1, booking_request_id: 2, artist_id: 3, quote_details: 'Hi', price: 100, currency: 'ZAR', status: 'pending_client_action', created_at: '', updated_at: '' },
        { id: 2, booking_request_id: 2, artist_id: 3, quote_details: 'Done', price: 120, currency: 'ZAR', status: 'confirmed_by_artist', created_at: '', updated_at: '' },
      ],
    });

    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);

    await act(async () => {
      root.render(<ClientQuotesPage />);
    });
    await act(async () => { await Promise.resolve(); });

    expect(getMyClientQuotes).toHaveBeenCalled();
    expect(div.textContent).toContain('My Quotes');
    expect(div.textContent).toContain('pending_client_action');
    expect(div.textContent).toContain('confirmed_by_artist');

    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
