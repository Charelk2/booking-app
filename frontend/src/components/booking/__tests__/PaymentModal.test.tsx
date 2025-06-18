import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import PaymentModal from '../PaymentModal';
import * as api from '@/lib/api';

jest.mock('@/lib/api');

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
          depositAmount={50}
        />,
      );
    });
    const input = div.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input.value).toBe('50');
    const form = div.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    });
    expect(api.createPayment).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith({
      status: 'deposit_paid',
      amount: 50,
      receiptUrl: '/api/v1/payments/pay_1/receipt',
    });
    root.unmount();
  });

  it('submits payment when pressing Enter in amount field', async () => {
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
          depositAmount={30}
        />,
      );
    });
    const form = div.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    });
    expect(api.createPayment).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith({
      status: 'deposit_paid',
      amount: 30,
      receiptUrl: '/api/v1/payments/pay_2/receipt',
    });
    root.unmount();
  });

  it('prefills amount from prop when reopened', async () => {
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
          depositAmount={40}
        />,
      );
    });
    const input = div.querySelector('input[type="number"]') as HTMLInputElement;
    act(() => {
      input.value = '75';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      root.render(
        <PaymentModal
          open={false}
          bookingRequestId={3}
          onClose={() => {}}
          onSuccess={() => {}}
          onError={() => {}}
          depositAmount={40}
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
          depositAmount={40}
        />,
      );
    });
    const reopened = div.querySelector('input[type="number"]') as HTMLInputElement;
    expect(reopened.value).toBe('40');
    root.unmount();
  });
});
