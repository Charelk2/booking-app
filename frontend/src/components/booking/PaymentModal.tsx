import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPayment, apiUrl } from '@/lib/api';

/* =========================
 * Types
 * ========================= */
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
  providerName?: string; // reserved for future
  serviceName?: string;
  /** Start checkout automatically when opened (default: true) */
  autoStart?: boolean;
  /** Allow clicking backdrop to close (default: true) */
  dismissOnBackdrop?: boolean;
}

/* =========================
 * Env Flags (read once)
 * ========================= */
const USE_PAYSTACK = process.env.NEXT_PUBLIC_USE_PAYSTACK === '1';

/* =========================
 * Small utilities
 * ========================= */
const safeSet = (k: string, v: string) => {
  try { localStorage.setItem(k, v); } catch { /* noop */ }
};
const rcptKey = (bookingRequestId: number) => `receipt_url:br:${bookingRequestId}`;

/** Exponential backoff sequence in ms (about 60–70s total) */
const BACKOFF_STEPS = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 8000];

const verifyPaystack = async (
  reference: string,
  bookingRequestId: number,
  signal?: AbortSignal
): Promise<{ ok: boolean; paymentId?: string; receiptUrl?: string }> => {
  const url = apiUrl(`/api/v1/payments/paystack/verify?reference=${encodeURIComponent(reference)}`);
  const resp = await fetch(url, { credentials: 'include', signal });
  if (!resp.ok) return { ok: false };
  const v = await resp.json();
  const paymentId = v?.payment_id || reference;
  const receiptUrl = apiUrl(`/api/v1/payments/${paymentId}/receipt`);
  safeSet(rcptKey(bookingRequestId), receiptUrl);
  return { ok: true, paymentId, receiptUrl };
};

/* =========================
 * Component
 * ========================= */
const PaymentModal: React.FC<PaymentModalProps> = ({
  open,
  onClose,
  bookingRequestId,
  onSuccess,
  onError,
  amount,
  serviceName,
  providerName: _unusedProviderName,
  autoStart = true,
  dismissOnBackdrop = true,
}) => {
  // UI/flow
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hosted checkout state
  const [paystackUrl, setPaystackUrl] = useState<string | null>(null);
  const [paystackReference, setPaystackReference] = useState<string | null>(null);

  // refs
  const modalRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);
  const verifyAbortRef = useRef<AbortController | null>(null);
  const isMounted = useRef(true);

  /* -------------------------
   * Helpers
   * ------------------------- */
  const resetState = useCallback(() => {
    setLoading(false);
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
  }, [onClose, resetState]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!dismissOnBackdrop) return;
      if (e.target === e.currentTarget) closeModal();
    },
    [closeModal, dismissOnBackdrop]
  );

  const handleCancel = useCallback(() => {
    if (typeof window !== 'undefined') {
      const confirmCancel = window.confirm('Cancel and return? You can restart payment anytime.');
      if (!confirmCancel) return;
    }
    closeModal();
  }, [closeModal]);

  const finishSuccess = useCallback(
    (res: PaymentSuccess) => {
      if (!isMounted.current) return;
      resetState();
      onSuccess(res);
    },
    [onSuccess, resetState]
  );

  const finishError = useCallback(
    (msg: string) => {
      if (!isMounted.current) return;
      setError(msg);
      setLoading(false);
      onError(msg);
    },
    [onError]
  );

  /* -------------------------
   * Start payment
   * ------------------------- */
  const startPayment = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setPaystackUrl(null);
    setPaystackReference(null);

    if (!USE_PAYSTACK) {
      finishError('Paystack is not enabled.');
      return;
    }

    try {
      // 1) Ask backend to create/initiate a Paystack transaction
      const res = await createPayment({
        booking_request_id: bookingRequestId,
        amount: Number(amount),
        full: true,
      });

      // 2) Backend should return a unique reference + authorization_url
      const data = res?.data as any;
      const reference: string = String(data?.reference || data?.payment_id || '').trim();
      const authorizationUrl: string | undefined = data?.authorization_url || data?.authorizationUrl;

      if (!reference) throw new Error('Payment reference missing');

      if (!authorizationUrl) {
        // Support for immediate-success paths if your backend sometimes completes instantly
        const paymentId: string | undefined = data?.payment_id || data?.id;
        const receiptUrl = paymentId ? apiUrl(`/api/v1/payments/${paymentId}/receipt`) : undefined;
        if (!paymentId) throw new Error('Missing authorization URL and no payment id');
        if (receiptUrl) safeSet(rcptKey(bookingRequestId), receiptUrl);
        finishSuccess({ status: 'paid', amount: Number(amount), paymentId, receiptUrl });
        return;
      }

      // 3) Load Paystack’s hosted checkout in an iframe
      setPaystackReference(reference);
      setPaystackUrl(authorizationUrl);
      setLoading(false);

      // 4) Begin verify loop (poll until Paystack/your backend marks it paid)
      verifyAbortRef.current?.abort();
      const ac = new AbortController();
      verifyAbortRef.current = ac;

      (async () => {
        let verified = false;

        // Immediate attempt
        try {
          const out = await verifyPaystack(reference, bookingRequestId, ac.signal);
          if (out.ok) {
            verified = true;
            finishSuccess({ status: 'paid', amount: Number(amount), paymentId: out.paymentId, receiptUrl: out.receiptUrl });
            return;
          }
        } catch { /* proceed to backoff attempts */ }

        for (const delay of BACKOFF_STEPS) {
          if (ac.signal.aborted) return;
          await new Promise(r => setTimeout(r, delay));
          try {
            const out = await verifyPaystack(reference, bookingRequestId, ac.signal);
            if (out.ok) {
              verified = true;
              finishSuccess({ status: 'paid', amount: Number(amount), paymentId: out.paymentId, receiptUrl: out.receiptUrl });
              return;
            }
          } catch { /* keep trying */ }
        }

        if (!verified && isMounted.current) {
          setError('Still waiting for payment confirmation… If you’ve completed checkout, this will update shortly.');
        }
      })();
    } catch (err: any) {
      const status = Number(err?.response?.status || 0);
      let msg = 'Payment failed. Please try again later.';
      if (status === 404) msg = 'This booking is not ready for payment or was not found.';
      else if (status === 403) msg = 'You are not allowed to pay for this booking.';
      else if (status === 422) msg = 'Invalid payment attempt. Please refresh and try again.';
      finishError(msg);
    } finally {
      setLoading(false);
    }
  }, [bookingRequestId, amount, loading, finishSuccess, finishError]);

  /* -------------------------
   * Effects
   * ------------------------- */
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      verifyAbortRef.current?.abort();
      verifyAbortRef.current = null;
    };
  }, []);

  // Focus trap + ESC
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
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            (last || first).focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          (first || last).focus();
        }
      }
    };

    document.addEventListener('keydown', onKey as any);
    (first || modal).focus();

    return () => document.removeEventListener('keydown', onKey as any);
  }, [open, handleCancel]);

  // Auto-start when opened
  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }
    if (!autoStart || startedRef.current) return;
    startedRef.current = true;
    startPayment().catch(() => {
      setLoading(false);
      setPaystackUrl(null);
      setPaystackReference(null);
    });
  }, [open, autoStart, startPayment, resetState]);

  /* -------------------------
   * Render
   * ------------------------- */
  if (!open) return null;
  const showBanner = Boolean(error || loading);

  return (
    <div
      className="fixed inset-0 z-[999999909] bg-black/40 flex items-center justify-center overflow-y-auto"
      onMouseDown={handleBackdropClick}
      aria-labelledby="payment-modal-title"
      aria-modal="true"
      role="dialog"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-4 mx-2 max-h-[90vh] overflow-y-auto outline-none"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="mb-3">
          <h2 id="payment-modal-title" className="text-lg font-semibold text-gray-900">
            Secure Checkout
          </h2>
          {serviceName && (
            <div className="mt-1 text-sm text-gray-700 flex items-center justify-between">
              <span>Service</span>
              <span className="text-gray-900 font-medium">{serviceName}</span>
            </div>
          )}
        </header>

        {showBanner && (
          <div className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-sm" role="status" aria-live="polite">
            {loading && <span>Opening secure checkout…</span>}
            {!loading && error && <span className="text-red-600">{error}</span>}
          </div>
        )}

        {paystackUrl ? (
          <div className="rounded-md border overflow-hidden">
            <iframe
              title="Paystack Checkout"
              src={paystackUrl}
              className="w-full h-[560px] border-0"
              allow="payment *; clipboard-write *"
            />
          </div>
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
        </footer>
      </div>
    </div>
  );
};

export default PaymentModal;
