import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import PaymentModal from '../PaymentModal';
import * as api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';

jest.mock('@/lib/api');

const ORIGINAL_FAKE = process.env.NEXT_PUBLIC_FAKE_PAYMENTS;

afterEach(() => {
  process.env.NEXT_PUBLIC_FAKE_PAYMENTS = ORIGINAL_FAKE;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PaymentModal', () => {
  it('submits payment', async () => {
    (api.createPayment as jest.Mock).mockResolvedValue({
      data: { payment_id: 'pay_1' },
    });
    const onSuccess = jest.fn();
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <PaymentModal
          open
          bookingRequestId={1}
          onClose={() => {}}
          onSuccess={onSuccess}
          onError={() => {}}
          amount={50}
        />,
      );
    });
    // Amount is displayed, not editable
    expect(div.textContent).toContain(formatCurrency(50));
    const form = div.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    });
    expect(api.createPayment).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith({
      status: 'paid',
      amount: 50,
      receiptUrl: '/api/v1/payments/pay_1/receipt',
      paymentId: 'pay_1',
    });
    act(() => {
      root.unmount();
    });
  });

  it('submits payment via form submit', async () => {
    (api.createPayment as jest.Mock).mockResolvedValue({
      data: { payment_id: 'pay_2' },
    });
    const onSuccess = jest.fn();
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <PaymentModal
          open
          bookingRequestId={2}
          onClose={() => {}}
          onSuccess={onSuccess}
          onError={() => {}}
          amount={30}
        />,
      );
    });
    expect(div.textContent).toContain(formatCurrency(30));
    const form = div.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    });
    expect(api.createPayment).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith({
      status: 'paid',
      amount: 30,
      receiptUrl: '/api/v1/payments/pay_2/receipt',
      paymentId: 'pay_2',
    });
    act(() => {
      root.unmount();
    });
  });

  it('shows amount from prop when reopened', async () => {
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <PaymentModal
          open
          bookingRequestId={3}
          onClose={() => {}}
          onSuccess={() => {}}
          onError={() => {}}
          amount={40}
        />,
      );
    });

    await act(async () => {
      root.render(
        <PaymentModal
          open={false}
          bookingRequestId={3}
          onClose={() => {}}
          onSuccess={() => {}}
          onError={() => {}}
          amount={40}
        />,
      );
    });

    await act(async () => {
      root.render(
        <PaymentModal
          open
          bookingRequestId={3}
          onClose={() => {}}
          onSuccess={() => {}}
          onError={() => {}}
          amount={40}
        />,
      );
    });
    expect(div.textContent).toContain(formatCurrency(40));
    act(() => {
      root.unmount();
    });
  });

  it('bypasses API when NEXT_PUBLIC_FAKE_PAYMENTS=1', async () => {
    process.env.NEXT_PUBLIC_FAKE_PAYMENTS = '1';
    const onSuccess = jest.fn();
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <PaymentModal
          open
          bookingRequestId={6}
          onClose={() => {}}
          onSuccess={onSuccess}
          onError={() => {}}
          amount={20}
        />,
      );
    });
    const form = div.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    });
    expect(api.createPayment).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith({ status: 'paid', amount: 20 });
    act(() => {
      root.unmount();
    });
  });
});
