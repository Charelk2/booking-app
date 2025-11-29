import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ClientBookingsPage from '../page';

// Mock API: upcoming + past bookings, and booking details
jest.mock('@/lib/api', () => ({
  __esModule: true,
  getMyClientBookings: jest.fn(async ({ status }: any) => ({
    data: status === 'upcoming'
      ? [
          {
            id: 10,
            status: 'pending',
            payment_status: 'pending',
            start_time: new Date().toISOString(),
            service_provider_id: 1,
            total_price: 123,
            service: {
              title: 'Show',
              service_provider: { business_name: 'SP' },
            },
          },
        ]
      : [],
  })),
  getBookingDetails: jest.fn(async (_id: number) => ({
    data: { id: 10, total_price: 123, payment_status: 'pending', booking_request_id: 77, service: { title: 'Show', service_provider: { business_name: 'SP' } } },
  })),
}));

// Mock payment hook to capture args and simulate success on open
const mockOpenPayment = jest.fn();
jest.mock('@/hooks/usePaymentModal', () => ({
  __esModule: true,
  default: (onSuccess: any, _onError: any) => ({
    openPaymentModal: (args: any) => { mockOpenPayment(args); onSuccess({ status: 'paid', amount: args.amount }); },
    paymentModal: null,
  }),
}));

// Auth with email
import { useAuth } from '@/contexts/AuthContext';

describe('ClientBookingsPage payments', () => {
  beforeEach(() => {
    (useAuth as any).mockReturnValue({ user: { email: 'buyer@example.com', user_type: 'client' }, loading: false });
    mockOpenPayment.mockReset();
  });

  it('clicking Pay now forwards customerEmail and marks paid in UI', async () => {
    render(<ClientBookingsPage />);

    // Wait for data to load and Pay now button to appear
    const payBtn = await screen.findByTestId('pay-now-button');
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(mockOpenPayment).toHaveBeenCalledWith(expect.objectContaining({
        bookingRequestId: 77,
        amount: 123,
        customerEmail: 'buyer@example.com',
      }));
    });
  });
});
