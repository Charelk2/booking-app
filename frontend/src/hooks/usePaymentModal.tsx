'use client';
import { useState, useCallback } from 'react';
import PaymentModal from '@/components/booking/PaymentModal';
import { createPayment } from '@/lib/api';

export interface PaymentSuccess {
  status: string;
  amount: number;
  receiptUrl?: string;
  paymentId?: string;
  mocked?: boolean;
}

interface OpenArgs { bookingRequestId: number; amount: number }

export default function usePaymentModal(
  onSuccess: (res: PaymentSuccess) => void,
  onError: (msg: string) => void,
) {
  const [open, setOpen] = useState(false);
  const [args, setArgs] = useState<OpenArgs | null>(null);

  const openPaymentModal = useCallback((opts: OpenArgs) => {
    const USE_PAYSTACK = process.env.NEXT_PUBLIC_USE_PAYSTACK === '1';
    if (USE_PAYSTACK) {
      // Fire-and-forget: initialize Paystack and open the checkout tab directly
      (async () => {
        try {
          const res = await createPayment({
            booking_request_id: opts.bookingRequestId,
            amount: Number(opts.amount),
            full: true,
          });
          const data = res.data as any;
          if (data && data.authorization_url) {
            window.open(String(data.authorization_url), '_blank', 'noopener,noreferrer');
            // Do not call onSuccess here; webhook/verify will update state
            return;
          }
        } catch (e) {
          // fall back to in-app modal on error
        }
        setArgs(opts);
        setOpen(true);
      })();
      return;
    }
    setArgs(opts);
    setOpen(true);
  }, []);

  const modal = args ? (
    <PaymentModal
      open={open}
      bookingRequestId={args.bookingRequestId}
      amount={args.amount}
      onClose={() => setOpen(false)}
      onSuccess={(result) => {
        setOpen(false);
        onSuccess(result);
      }}
      onError={(msg) => {
        setOpen(false);
        onError(msg);
      }}
    />
  ) : null;

  return { openPaymentModal, paymentModal: modal };
}
