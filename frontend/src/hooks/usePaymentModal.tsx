'use client';
import { useState, useCallback } from 'react';
import PaymentModal from '@/components/booking/PaymentModal';

export interface PaymentSuccess {
  status: string;
  amount: number;
  receiptUrl?: string;
  paymentId?: string;
}

interface OpenArgs { bookingRequestId: number; amount: number }

export default function usePaymentModal(
  onSuccess: (res: PaymentSuccess) => void,
  onError: (msg: string) => void,
) {
  const [open, setOpen] = useState(false);
  const [args, setArgs] = useState<OpenArgs | null>(null);

  const openPaymentModal = useCallback((opts: OpenArgs) => {
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
