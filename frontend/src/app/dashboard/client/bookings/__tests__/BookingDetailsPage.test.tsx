import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import BookingDetailsPage from '../[id]/page';
import { getBookingDetails, downloadBookingIcs } from '@/lib/api';
import { useParams } from 'next/navigation';

jest.mock('@/lib/api');
jest.mock('next/navigation', () => ({
  useParams: jest.fn(),
  usePathname: jest.fn(() => '/dashboard/client/bookings/1'),
}));

describe('BookingDetailsPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders booking details and shows pay button when pending', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: '1' });
    (getBookingDetails as jest.Mock).mockResolvedValue({
      data: {
        id: 1,
        artist_id: 2,
        client_id: 3,
        service_id: 4,
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString(),
        status: 'confirmed',
        total_price: 100,
        notes: '',
        deposit_amount: 50,
        payment_status: 'pending',
        service: { title: 'Gig' },
        client: { id: 3 },
      },
    });
    (downloadBookingIcs as jest.Mock).mockResolvedValue({ data: new Blob() });

    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(<BookingDetailsPage />);
    });
    await act(async () => { await Promise.resolve(); });

    expect(getBookingDetails).toHaveBeenCalledWith(1);
    expect(div.textContent).toContain('Gig');
    const pay = div.querySelector('[data-testid="pay-deposit-button"]');
    expect(pay).not.toBeNull();

    act(() => { root.unmount(); });
    div.remove();
  });
});
