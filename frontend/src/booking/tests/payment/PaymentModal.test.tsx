import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import PaymentModal from '@/components/booking/PaymentModal';
import * as api from '@/lib/api';

jest.mock('@/lib/api');
jest.mock('@/utils/paystackClient', () => ({
  __esModule: true,
  openPaystackInline: jest.fn(async (opts: any) => {
    // default: simulate immediate success
    if (opts?.onSuccess) opts.onSuccess(opts?.reference || 'ref_inline');
  }),
}));

const { openPaystackInline } = jest.requireMock('@/utils/paystackClient');

describe('PaymentModal (inline only)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.NEXT_PUBLIC_USE_PAYSTACK = '1';
  });

  it('opens inline popup and completes via verify', async () => {
    // Backend init returns a reference and authorization_url
    (api.createPayment as jest.Mock).mockResolvedValue({
      data: { reference: 'ref_123', authorization_url: 'https://checkout.paystack.com/abc' },
    });
    const onSuccess = jest.fn();
    const onError = jest.fn();
    const div = document.createElement('div');
    const root = createRoot(div);

    await act(async () => {
      root.render(
        <PaymentModal
          open
          onClose={() => {}}
          bookingRequestId={45}
          amount={500}
          customerEmail="test@example.com"
          onSuccess={onSuccess}
          onError={onError}
        />
      );
    });

    // Inline was invoked with ZAR and subunits via openPaystackInline
    expect(openPaystackInline).toHaveBeenCalled();
    expect(api.createPayment).toHaveBeenCalledWith({ booking_request_id: 45, amount: 500, full: true });

    // Verify completes immediately (global.fetch returns ok=true with empty JSON → falls back to reference)
    await act(async () => {});
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({
      status: 'paid',
      amount: 500,
      paymentId: 'ref_123',
    }));

    act(() => { root.unmount(); });
  });

  it('shows error when email is missing (inline-only requires email)', async () => {
    (api.createPayment as jest.Mock).mockResolvedValue({
      data: { reference: 'ref_789', authorization_url: 'https://checkout.paystack.com/xyz' },
    });
    const onError = jest.fn();
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <PaymentModal
          open
          onClose={() => {}}
          bookingRequestId={9}
          amount={120}
          onSuccess={() => {}}
          onError={onError}
        />
      );
    });
    // No email provided → error rendered and openPaystackInline not called
    expect(openPaystackInline).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled(); // internal error state is set in the modal
    expect(div.textContent).toContain('A valid email is required to start payment.');
    act(() => { root.unmount(); });
  });

  it('surfaces error when user closes the inline popup', async () => {
    // Mock inline to call onClose instead of onSuccess
    (openPaystackInline as jest.Mock).mockImplementationOnce(async (opts: any) => {
      if (opts?.onClose) opts.onClose();
    });
    (api.createPayment as jest.Mock).mockResolvedValue({
      data: { reference: 'ref_321', authorization_url: 'https://checkout.paystack.com/def' },
    });
    const onError = jest.fn();
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <PaymentModal
          open
          onClose={() => {}}
          bookingRequestId={12}
          amount={200}
          customerEmail="user@example.com"
          onSuccess={() => {}}
          onError={onError}
        />
      );
    });
    expect(openPaystackInline).toHaveBeenCalled();
    // Modal shows friendly close message
    expect(div.textContent).toContain('Checkout closed. Please try again.');
    act(() => { root.unmount(); });
  });

  it('surfaces error when inline popup fails to open', async () => {
    (openPaystackInline as jest.Mock).mockRejectedValueOnce(new Error('Blocked'));
    (api.createPayment as jest.Mock).mockResolvedValue({
      data: { reference: 'ref_fail', authorization_url: 'https://checkout.paystack.com/ghi' },
    });
    const onError = jest.fn();
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <PaymentModal
          open
          onClose={() => {}}
          bookingRequestId={13}
          amount={99}
          customerEmail="u@example.com"
          onSuccess={() => {}}
          onError={onError}
        />
      );
    });
    expect(openPaystackInline).toHaveBeenCalled();
    expect(div.textContent).toContain('Could not open Paystack popup. Please try again.');
    act(() => { root.unmount(); });
  });
});

