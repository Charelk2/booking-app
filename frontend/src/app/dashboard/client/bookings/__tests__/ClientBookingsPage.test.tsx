import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import ClientBookingsPage from '../page';
import { getMyClientBookings } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/dashboard/client/bookings'),
}));

describe('ClientBookingsPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders upcoming and past bookings', async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 1, user_type: 'client', email: 'c@example.com', first_name: 'C' },
    });
    (getMyClientBookings as jest.Mock)
      .mockResolvedValueOnce({
        data: [
          {
            id: 1,
            artist_id: 2,
            client_id: 1,
            service_id: 4,
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString(),
            status: 'confirmed',
            total_price: 100,
            notes: '',
            service: { title: 'Gig' },
            client: { id: 1 },
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 2,
            artist_id: 2,
            client_id: 1,
            service_id: 4,
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString(),
            status: 'completed',
            total_price: 200,
            notes: '',
            service: { title: 'Gig' },
            client: { id: 1 },
          },
        ],
      });

    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);

    await act(async () => {
      root.render(<ClientBookingsPage />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getMyClientBookings).toHaveBeenCalledWith({ status: 'upcoming' });
    expect(getMyClientBookings).toHaveBeenCalledWith({ status: 'past' });
    expect(div.textContent).toContain('Upcoming Bookings');
    expect(div.textContent).toContain('Past Bookings');

    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it('shows review button for completed bookings', async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 1, user_type: 'client', email: 'c@example.com', first_name: 'C' },
    });
    (getMyClientBookings as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            id: 9,
            artist_id: 2,
            client_id: 1,
            service_id: 4,
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString(),
            status: 'completed',
            total_price: 100,
            notes: '',
            service: { title: 'Gig' },
            client: { id: 1 },
          },
        ],
      });

    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);

    await act(async () => {
      root.render(<ClientBookingsPage />);
    });
    await act(async () => { await Promise.resolve(); });

    expect(div.textContent).toContain('Leave review');

    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
