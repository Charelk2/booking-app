'use client';
import { useState, useCallback } from 'react';
import PaymentModal from '@/components/booking/PaymentModal';
import { emitThreadsUpdated } from '@/lib/chat/threadsEvents';
import { createPayment } from '@/lib/api';

export interface PaymentSuccess {
  status: string;
  amount: number;
  receiptUrl?: string;
  paymentId?: string;
  mocked?: boolean;
}

interface OpenArgs { bookingRequestId: number; amount: number; providerName?: string; serviceName?: string }

export default function usePaymentModal(
  onSuccess: (res: PaymentSuccess) => void,
  onError: (msg: string) => void,
) {
  const [open, setOpen] = useState(false);
  const [args, setArgs] = useState<OpenArgs | null>(null);

  const openPaymentModal = useCallback((opts: OpenArgs) => {
    // Always open the in-app modal. It will handle Paystack init, polling,
    // and demo fallbacks, and crucially invoke onSuccess so the UI updates.
    setArgs(opts);
    setOpen(true);
  }, []);

  const modal = args ? (
    <PaymentModal
      open={open}
      bookingRequestId={args.bookingRequestId}
      amount={args.amount}
      providerName={args.providerName}
      serviceName={args.serviceName}
      onClose={() => setOpen(false)}
      onSuccess={(result) => {
        setOpen(false);
        try {
          if (args?.bookingRequestId) {
            emitThreadsUpdated({ threadId: args.bookingRequestId, reason: 'payment', source: 'client', immediate: true }, { immediate: true, force: true });
          }
        } catch {}
        onSuccess(result);
      }}
      onError={(msg) => {
        // Keep modal open so the user can see the error and retry
        onError(msg);
      }}
    />
  ) : null;

  return { openPaymentModal, paymentModal: modal };
}
