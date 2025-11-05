import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// Mock heavy children used by MessageThreadWrapper to keep test focused
jest.mock('../index.web', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/chat/BookingSummarySkeleton', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/chat/InlineQuoteForm', () => ({ __esModule: true, default: () => null }));

// Capture the openPaymentModal prop by mocking BookingDetailsPanel
let capturedOpenPayment: ((args: { bookingRequestId: number; amount: number }) => void) | null = null;
jest.mock('@/components/chat/BookingDetailsPanel', () => ({
  __esModule: true,
  default: (props: any) => {
    capturedOpenPayment = props.openPaymentModal;
    return null;
  },
}));

// Mock the payment hook to spy on forwarded args
const openSpy = jest.fn();
jest.mock('@/hooks/usePaymentModal', () => ({
  __esModule: true,
  default: (_onSuccess: any, _onError: any) => ({ openPaymentModal: openSpy, paymentModal: null }),
}));

import MessageThreadWrapper from '../MessageThreadWrapper';
import { useAuth } from '@/contexts/AuthContext';

describe('MessageThreadWrapper payments', () => {
  beforeEach(() => {
    openSpy.mockReset();
    (useAuth as any).mockReturnValue({
      user: { email: 'client@example.com', user_type: 'client' },
      loading: false,
    });
  });

  it('forwards customerEmail to openPaymentModal', async () => {
    const div = document.createElement('div');
    const root = createRoot(div);

    await act(async () => {
      root.render(
        <MessageThreadWrapper
          bookingRequestId={123}
          bookingRequest={{ id: 123 } as any}
          setShowReviewModal={() => {}}
          isActive
        />
      );
    });

    // Simulate a user clicking "Pay now" by directly invoking the captured handler
    expect(typeof capturedOpenPayment).toBe('function');
    await act(async () => {
      capturedOpenPayment && capturedOpenPayment({ bookingRequestId: 123, amount: 999 });
    });

    expect(openSpy).toHaveBeenCalledWith(
      expect.objectContaining({ bookingRequestId: 123, amount: 999, customerEmail: 'client@example.com' })
    );

    act(() => { root.unmount(); });
  });
});

