import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import PaymentModal from '../PaymentModal';
import * as api from '@/lib/api';

jest.mock('@/lib/api');

describe('PaymentModal', () => {
  it('submits payment', async () => {
    (api.createPayment as jest.Mock).mockResolvedValue({ data: {} });
    const onSuccess = jest.fn();
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <PaymentModal open bookingRequestId={1} onClose={() => {}} onSuccess={onSuccess} onError={() => {}} />,
      );
    });
    const input = div.querySelector('input[type="number"]') as HTMLInputElement;
    await act(async () => {
      input.value = '25';
      input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    });
    const button = Array.from(div.querySelectorAll('button')).find((b) => b.textContent === 'Pay') as HTMLButtonElement;
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(api.createPayment).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith('deposit_paid');
    root.unmount();
  });
});
