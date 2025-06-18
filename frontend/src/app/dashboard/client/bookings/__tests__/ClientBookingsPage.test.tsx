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

  it('renders upcoming and past bookings with deposit info', async () => {
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
            deposit_amount: 50,
            payment_status: 'deposit_paid',
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
            deposit_amount: 100,
            payment_status: 'paid',
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
    expect(div.textContent).toContain('Deposit:');
    expect(div.textContent).toContain('Deposit Paid');
    expect(div.textContent).toContain('Requested');
    expect(div.textContent).toContain('Completed');
    const help = div.querySelector('[data-testid="help-prompt"]');
    expect(help).not.toBeNull();

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
            deposit_amount: 50,
            payment_status: 'deposit_paid',
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
    const help = div.querySelector('[data-testid="help-prompt"]');
    expect(help).not.toBeNull();

    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
