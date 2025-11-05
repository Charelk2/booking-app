'use client';

import { useState, useCallback, useRef } from 'react';
import PaymentModal from '@/components/booking/PaymentModal';
import { emitThreadsUpdated } from '@/lib/chat/threadsEvents';

export interface PaymentSuccess {
  status: string;
  amount: number;
  receiptUrl?: string;
  paymentId?: string;
  mocked?: boolean;
}

type OpenArgs = {
  bookingRequestId: number;
  amount: number;
  providerName?: string;
  serviceName?: string;

  // Optional: pass-through to PaymentModal (supported by your refactor)
  autoStart?: boolean;
  dismissOnBackdrop?: boolean;
  preferInline?: boolean;
  customerEmail?: string;
  currency?: string;
};

export default function usePaymentModal(
  onSuccess: (res: PaymentSuccess) => void,
  onError: (msg: string) => void,
) {
  const [open, setOpen] = useState(false);
  const [args, setArgs] = useState<OpenArgs | null>(null);
  const latestArgsRef = useRef<OpenArgs | null>(null);

  const openPaymentModal = useCallback((opts: OpenArgs) => {
    latestArgsRef.current = opts;
    setArgs(opts);
    setOpen(true);
  }, []);

  const closePaymentModal = useCallback(() => {
    setOpen(false);
    setArgs(null);
    latestArgsRef.current = null;
  }, []);

  const handleSuccess = useCallback((result: PaymentSuccess) => {
    // Close and unmount so any iframe/inline state & polling are torn down
    setOpen(false);
    setArgs(null);

    try {
      const la = latestArgsRef.current;
      if (la?.bookingRequestId) {
        emitThreadsUpdated(
          { threadId: la.bookingRequestId, reason: 'payment', source: 'client', immediate: true },
          { immediate: true, force: true },
        );
      }
    } catch {
      // no-op; updates are best-effort
    }

    onSuccess(result);
  }, [onSuccess]);

  const handleError = useCallback((msg: string) => {
    // Keep modal open so the user can see the error and retry
    onError(msg);
  }, [onError]);

  const handleClose = useCallback(() => {
    // Unmount the modal to reset its internal state (Paystack URL/reference, timers, errors)
    setOpen(false);
    setArgs(null);
    latestArgsRef.current = null;
  }, []);

  const modal = args ? (
    <PaymentModal
      {...(args as any)}
      open={open}
      onClose={handleClose}
      onSuccess={handleSuccess}
      onError={handleError}
    />
  ) : null;

  return {
    openPaymentModal,
    paymentModal: modal,
    isOpen: open,
    closePaymentModal,
  };
}
