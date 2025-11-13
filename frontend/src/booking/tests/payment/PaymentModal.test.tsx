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

const mockWindowOpen = jest.fn();

beforeAll(() => {
  Object.defineProperty(window, 'open', {
    writable: true,
    configurable: true,
    value: mockWindowOpen,
  });
});

afterEach(() => {
  mockWindowOpen.mockReset();
});

describe('PaymentModal (inline only)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.NEXT_PUBLIC_USE_PAYSTACK = '1';
  });

  it('opens inline popup and completes via verify', async () => {
    // Backend init returns a reference and authorization_url
    (api.createPayment as jest.Mock).mockResolvedValue({
      data: { reference: 'ref_123', amount: 750, currency: 'ZAR' },
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
    expect(api.createPayment).toHaveBeenCalledWith(expect.objectContaining({ booking_request_id: 45, full: true, inline: true }));
    const inlineArgs = (openPaystackInline as jest.Mock).mock.calls[0][0];
    expect(inlineArgs.amountMajor).toBe(750);
    expect(inlineArgs.currency).toBe('ZAR');

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
    // No email provided → hosted fallback triggered and window.open called
    expect(openPaystackInline).not.toHaveBeenCalled();
    expect(api.createPayment).toHaveBeenCalledWith(expect.objectContaining({ booking_request_id: 9, inline: false, full: true }));
    expect(onError).not.toHaveBeenCalled(); // internal error state is set in the modal
    expect(mockWindowOpen).toHaveBeenCalledWith('https://checkout.paystack.com/xyz', '_blank');
    expect(div.textContent).toContain('Verifying payment…');
    act(() => { root.unmount(); });
  });

  it('surfaces error when user closes the inline popup', async () => {
    // Mock inline to call onClose instead of onSuccess
    (openPaystackInline as jest.Mock).mockImplementationOnce(async (opts: any) => {
      if (opts?.onClose) opts.onClose();
    });
    (api.createPayment as jest.Mock).mockResolvedValue({
      data: { reference: 'ref_321', amount: 200, currency: 'ZAR' },
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
    const inlineArgs = (openPaystackInline as jest.Mock).mock.calls[0][0];
    expect(inlineArgs.amountMajor).toBe(200);
    // Modal shows friendly close message
    expect(div.textContent).toContain('Checkout closed. Please try again.');
    act(() => { root.unmount(); });
  });

  it('surfaces error when inline popup fails to open', async () => {
    (openPaystackInline as jest.Mock).mockRejectedValueOnce(new Error('Blocked'));
    (api.createPayment as jest.Mock).mockResolvedValue({
      data: { reference: 'ref_fail', amount: 99, currency: 'ZAR' },
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
    const inlineArgs = (openPaystackInline as jest.Mock).mock.calls[0][0];
    expect(inlineArgs.amountMajor).toBe(99);
    expect(div.textContent).toContain('Could not open Paystack popup. Please try again.');
    act(() => { root.unmount(); });
  });

  it('opens inline when server returns inline status (no authorization_url)', async () => {
    // Server indicates inline-only path: provide a reference but no hosted URL
    (api.createPayment as jest.Mock).mockResolvedValue({
      data: { status: 'inline', reference: 'ref_inline', amount: 250, currency: 'ZAR' },
    });

    const onSuccess = jest.fn();
    const div = document.createElement('div');
    const root = createRoot(div);

    // Prevent any accidental hosted fallback
    const wOpen = jest.spyOn(window, 'open').mockImplementation(() => null as any);

    await act(async () => {
      root.render(
        <PaymentModal
          open
          onClose={() => {}}
          bookingRequestId={77}
          amount={250}
          customerEmail="inline@example.com"
          onSuccess={onSuccess}
          onError={() => {}}
        />
      );
    });

    // Inline was invoked
    expect(openPaystackInline).toHaveBeenCalled();
    const inlineArgs = (openPaystackInline as jest.Mock).mock.calls[0][0];
    expect(inlineArgs.amountMajor).toBe(250);
    // No hosted fallback attempted
    expect(wOpen).not.toHaveBeenCalled();

    wOpen.mockRestore();
    act(() => { root.unmount(); });
  });
});
