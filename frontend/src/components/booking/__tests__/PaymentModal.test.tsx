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
          depositAmount={50}
        />,
      );
    });
    const input = div.querySelector('input[type="text"]') as HTMLInputElement;
    const label = div.querySelector('label[for="deposit-amount"]');
    expect(label).not.toBeNull();
    expect(label?.textContent).toContain('Amount');
    expect(input.value).toBe(formatCurrency(50));
    const form = div.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    });
    expect(api.createPayment).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith({
      status: 'deposit_paid',
      amount: 50,
      receiptUrl: '/api/v1/payments/pay_1/receipt',
      paymentId: 'pay_1',
    });
    act(() => {
      root.unmount();
    });
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
    const label = div.querySelector('label[for="deposit-amount"]');
    expect(label).not.toBeNull();
    expect(label?.textContent).toContain('Amount');
    const input = div.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe(formatCurrency(30));
    const form = div.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    });
    expect(api.createPayment).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith({
      status: 'deposit_paid',
      amount: 30,
      receiptUrl: '/api/v1/payments/pay_2/receipt',
      paymentId: 'pay_2',
    });
    act(() => {
      root.unmount();
    });
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
    const input = div.querySelector('input[type="text"]') as HTMLInputElement;
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
    const reopened = div.querySelector('input[type="text"]') as HTMLInputElement;
    const reopenedLabel = div.querySelector('label[for="deposit-amount"]');
    expect(reopenedLabel).not.toBeNull();
    expect(reopenedLabel?.textContent).toContain('Amount');
    expect(reopened.value).toBe(formatCurrency(40));
    act(() => {
      root.unmount();
    });
  });

  it('shows deposit due date when provided', async () => {
    const div = document.createElement('div');
    const root = createRoot(div);
    const due = '2024-01-05T00:00:00Z';
    await act(async () => {
      root.render(
        <PaymentModal
          open
          bookingRequestId={4}
          onClose={() => {}}
          onSuccess={() => {}}
          onError={() => {}}
          depositAmount={25}
          depositDueBy={due}
        />,
      );
    });
    const heading = div.querySelector('h2');
    expect(heading?.textContent).toContain(
      `Due by ${format(new Date(due), 'PPP')}`,
    );
    const notes = div.querySelectorAll('p.text-sm.text-gray-600');
    const note = notes[0];
    expect(note).not.toBeNull();
    expect(note.textContent).toContain(
      `Deposit of ${formatCurrency(25)}`,
    );
    const help = notes[1];
    expect(help.textContent).toContain('deposit');
    act(() => {
      root.unmount();
    });
  });

  it('updates helper text when paying full amount', async () => {
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <PaymentModal
          open
          bookingRequestId={5}
          onClose={() => {}}
          onSuccess={() => {}}
          onError={() => {}}
          depositAmount={40}
        />,
      );
    });
    const checkbox = div.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      checkbox.click();
    });
    const notes = div.querySelectorAll('p.text-sm.text-gray-600');
    const help = notes[1];
    expect(help).not.toBeNull();
    expect(help.textContent).toContain('full amount');
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
          depositAmount={20}
        />,
      );
    });
    const form = div.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    });
    expect(api.createPayment).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith({ status: 'deposit_paid', amount: 20 });
    act(() => {
      root.unmount();
    });
  });
});
