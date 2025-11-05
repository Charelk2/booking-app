// components/PaymentModal.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPayment, apiUrl } from '@/lib/api';
import { BACKOFF_STEPS, verifyPaystack, safeSet, rcptKey, PAYSTACK_ENABLED } from '@/utils/payment';

type PaymentStatus = 'idle' | 'starting' | 'ready' | 'verifying' | 'verified' | 'error';

interface PaymentSuccess {
  status: string;
  amount: number;
  receiptUrl?: string;
  paymentId?: string;
}

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  bookingRequestId: number;
  onSuccess: (result: PaymentSuccess) => void;
  onError: (msg: string) => void;
  amount: number;
  providerName?: string;
  serviceName?: string;
  autoStart?: boolean;
  dismissOnBackdrop?: boolean;
}

const CheckoutFrame: React.FC<{ src: string }> = ({ src }) => (
  <div className="rounded-md border overflow-hidden">
    <iframe
      title="Paystack Checkout"
      src={src}
      className="w-full h-[560px] border-0"
      allow="payment *; clipboard-write *"
      aria-label="Secure Paystack Checkout"
    />
  </div>
);

const PaymentModal: React.FC<PaymentModalProps> = ({
  open,
  onClose,
  bookingRequestId,
  onSuccess,
  onError,
  amount,
  serviceName,
  autoStart = true,
  dismissOnBackdrop = true,
}) => {
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [paystackUrl, setPaystackUrl] = useState<string | null>(null);
  const [paystackReference, setPaystackReference] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);
  const verifyAbortRef = useRef<AbortController | null>(null);
  const isMounted = useRef(true);

  const resetState = useCallback(() => {
    setStatus('idle');
    setError(null);
    setPaystackUrl(null);
    setPaystackReference(null);
    startedRef.current = false;
    verifyAbortRef.current?.abort();
    verifyAbortRef.current = null;
  }, []);

  const closeModal = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dismissOnBackdrop && e.target === e.currentTarget) {
      closeModal();
    }
  };

  const handleCancel = () => {
    if (typeof window !== 'undefined') {
      const confirm = window.confirm('Cancel and return? You can restart payment anytime.');
      if (!confirm) return;
    }
    closeModal();
  };

  const finishSuccess = (res: PaymentSuccess) => {
    if (!isMounted.current) return;
    resetState();
    onSuccess(res);
  };

  const finishError = (msg: string) => {
    if (!isMounted.current) return;
    setStatus('error');
    setError(msg);
    onError(msg);
  };

  const startPayment = useCallback(async () => {
    if (status === 'starting' || status === 'verifying') return;

    setStatus('starting');
    setError(null);

    if (!PAYSTACK_ENABLED) {
      finishError('Paystack is not enabled.');
      return;
    }

    try {
      const res = await createPayment({
        booking_request_id: bookingRequestId,
        amount: Number(amount),
        full: true,
      });

      const data = res?.data || {};
      const reference = String(data?.reference || data?.payment_id || '').trim();
      const authorizationUrl = data?.authorization_url || data?.authorizationUrl;

      if (!reference) throw new Error('Missing payment reference');

      if (!authorizationUrl) {
        const paymentId = data?.payment_id || data?.id;
        if (!paymentId) throw new Error('No authorization URL or payment ID');
        const receiptUrl = apiUrl(`/api/v1/payments/${paymentId}/receipt`);
        safeSet(rcptKey(bookingRequestId), receiptUrl);
        finishSuccess({ status: 'paid', amount, paymentId, receiptUrl });
        return;
      }

      setPaystackReference(reference);
      setPaystackUrl(authorizationUrl);
      setStatus('ready');

      verifyAbortRef.current?.abort();
      const ac = new AbortController();
      verifyAbortRef.current = ac;

      setStatus('verifying');

      let verified = false;

      const attemptVerify = async () => {
        try {
          const out = await verifyPaystack(reference, bookingRequestId, ac.signal);
          if (out.ok) {
            verified = true;
            finishSuccess({ status: 'paid', amount, paymentId: out.paymentId, receiptUrl: out.receiptUrl });
          }
        } catch {
          // ignored
        }
      };

      await attemptVerify();
      for (const delay of BACKOFF_STEPS) {
        if (verified || ac.signal.aborted) return;
        await new Promise((r) => setTimeout(r, delay));
        await attemptVerify();
      }

      if (!verified) {
        setStatus('error');
        setError('Still waiting for payment confirmation… If you’ve completed checkout, this will update shortly.');
      }
    } catch (err: any) {
      const statusCode = Number(err?.response?.status || 0);
      let msg = 'Payment failed. Please try again.';
      if (statusCode === 404) msg = 'This booking was not found or is not payable.';
      else if (statusCode === 403) msg = 'You are not allowed to pay for this booking.';
      else if (statusCode === 422) msg = 'Invalid payment attempt. Refresh and try again.';
      finishError(msg);
    }
  }, [status, amount, bookingRequestId, finishSuccess, finishError]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      verifyAbortRef.current?.abort();
      verifyAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }
    if (!autoStart || startedRef.current) return;
    startedRef.current = true;
    startPayment();
  }, [open, autoStart, startPayment, resetState]);

  // Trap focus + ESC
  useEffect(() => {
    if (!open || !modalRef.current) return;
    const modal = modalRef.current;
    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
      if (e.key === 'Tab') {
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          (last || first).focus();
        } else if (document.activeElement === last) {
          e.preventDefault();
          (first || last).focus();
        }
      }
    };

    document.addEventListener('keydown', onKey);
    (first || modal).focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const loading = status === 'starting' || status === 'verifying';

  return (
    <div
      className="fixed inset-0 z-[999999909] bg-black/40 flex items-center justify-center overflow-y-auto"
      onMouseDown={handleBackdropClick}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-4 mx-2 max-h-[90vh] overflow-y-auto outline-none"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Secure Checkout</h2>
          {serviceName && (
            <div className="mt-1 text-sm text-gray-700 flex items-center justify-between">
              <span>Service</span>
              <span className="text-gray-900 font-medium">{serviceName}</span>
            </div>
          )}
        </header>

        {(loading || error) && (
          <div className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-sm" role="status">
            {loading && <span>{status === 'starting' ? 'Opening secure checkout…' : 'Verifying payment…'}</span>}
            {status === 'error' && error && <span className="text-red-600">{error}</span>}
          </div>
        )}

        {paystackUrl ? (
          <CheckoutFrame src={paystackUrl} />
        ) : (
          <div className="text-sm text-gray-600">
            {!loading && !error && <p>Preparing checkout… If nothing happens, try again.</p>}
          </div>
        )}

        <footer className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="px-3 py-2 rounded-md border text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          {!autoStart && (
            <button
              type="button"
              onClick={startPayment}
              disabled={loading}
              className="px-3 py-2 rounded-md bg-black text-white text-sm font-semibold disabled:opacity-60"
            >
              {loading ? 'Starting…' : 'Pay Now'}
            </button>
          )}
          {status === 'error' && (
            <button
              type="button"
              onClick={startPayment}
              className="px-2 py-2 text-sm underline text-blue-600 hover:text-blue-800"
            >
              Try Again
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};

export default PaymentModal;
