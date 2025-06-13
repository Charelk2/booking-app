import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import ArtistBookingsPage from '../page';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/dashboard/bookings'),
}));

describe('ArtistBookingsPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders bookings list with quote links', async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'artist', email: 'a@example.com' } });
    (api.getMyArtistBookings as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          artist_id: 2,
          client_id: 3,
          service_id: 4,
          start_time: new Date().toISOString(),
          end_time: new Date().toISOString(),
          status: 'confirmed',
          total_price: 200,
          notes: '',
          client: { first_name: 'Client', last_name: 'User' },
          service: { title: 'Show' },
          source_quote: { id: 5 },
        },
      ],
    });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(<ArtistBookingsPage />);
    });
    await act(async () => { await Promise.resolve(); });
    expect(div.textContent).toContain('View Quote');
    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
