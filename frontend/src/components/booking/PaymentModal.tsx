// components/booking/PaymentModal.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPayment, apiUrl } from '@/lib/api';
import { openPaystackInline } from '@/utils/paystackClient';

// If you already created these in another file (from your previous code), keep using that.
// Minimal in-file versions included here for completeness:
const PAYSTACK_ENABLED = process.env.NEXT_PUBLIC_USE_PAYSTACK === '1';
const BACKOFF_STEPS = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 8000];

const rcptKey = (bookingRequestId: number) => `receipt_url:br:${bookingRequestId}`;
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

async function verifyPaystack(reference: string, bookingRequestId: number, signal?: AbortSignal) {
  const url = apiUrl(`/api/v1/payments/paystack/verify?reference=${encodeURIComponent(reference)}`);
  const resp = await fetch(url, { credentials: 'include', signal });
  if (!resp.ok) return { ok: false as const };
  const v = await resp.json();
  const paymentId = v?.payment_id || reference;
  const receiptUrl = apiUrl(`/api/v1/payments/${paymentId}/receipt`);
  safeSet(rcptKey(bookingRequestId), receiptUrl);
  return { ok: true as const, paymentId, receiptUrl };
}

type PaymentStatus = 'idle' | 'starting' | 'inline' | 'verifying' | 'ready-hosted' | 'error';

export interface PaymentSuccess {
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
  amount: number;                 // major units
  serviceName?: string;
  /** Try inline popup first (recommended) */
  preferInline?: boolean;
  /** Customer email (Paystack requires it for inline). If missing, user can input. */
  customerEmail?: string;
  /** Currency code, defaults to NGN */
  currency?: string;
  /** Start checkout automatically when opened (default: true) */
  autoStart?: boolean;
  /** Allow clicking backdrop to close (default: true) */
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
  preferInline = true,
  customerEmail,
  currency = 'NGN',
  autoStart = true,
  dismissOnBackdrop = true,
}) => {
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const [paystackUrl, setPaystackUrl] = useState<string | null>(null);
  const [paystackReference, setPaystackReference] = useState<string | null>(null);
  const [email, setEmail] = useState(customerEmail || '');

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
    setEmail(customerEmail || '');
  }, [customerEmail]);

  const closeModal = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dismissOnBackdrop && e.target === e.currentTarget) closeModal();
  };

  const handleCancel = () => {
    if (typeof window !== 'undefined') {
      const confirmCancel = window.confirm('Cancel and return? You can restart payment anytime.');
      if (!confirmCancel) return;
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

  const startVerifyLoop = useCallback(
    async (reference: string) => {
      verifyAbortRef.current?.abort();
      const ac = new AbortController();
      verifyAbortRef.current = ac;

      setStatus('verifying');

      // immediate try
      try {
        const out = await verifyPaystack(reference, bookingRequestId, ac.signal);
        if (out.ok) {
          finishSuccess({ status: 'paid', amount, paymentId: out.paymentId, receiptUrl: out.receiptUrl });
          return;
        }
      } catch {}

      for (const delay of BACKOFF_STEPS) {
        if (ac.signal.aborted) return;
        await new Promise(r => setTimeout(r, delay));
        try {
          const out = await verifyPaystack(reference, bookingRequestId, ac.signal);
          if (out.ok) {
            finishSuccess({ status: 'paid', amount, paymentId: out.paymentId, receiptUrl: out.receiptUrl });
            return;
          }
        } catch {}
      }

      if (isMounted.current) {
        setStatus('error');
        setError('Still waiting for payment confirmation… If you’ve completed checkout, this will update shortly.');
      }
    },
    [amount, bookingRequestId, finishSuccess]
  );

  /** Attempt inline checkout, or fall back to hosted URL */
  const startPayment = useCallback(async () => {
    if (status === 'starting' || status === 'inline' || status === 'verifying') return;

    setStatus('starting');
    setError(null);
    setPaystackUrl(null);
    setPaystackReference(null);

    if (!PAYSTACK_ENABLED) {
      finishError('Paystack is not enabled.');
      return;
    }

    try {
      // 1) Ask backend to initiate a transaction (get reference + authorization_url)
      const res = await createPayment({
        booking_request_id: bookingRequestId,
        amount: Number(amount),
        full: true,
      });

      const data = res?.data || {};
      const reference: string = String(data?.reference || data?.payment_id || '').trim();
      const authorizationUrl: string | undefined = data?.authorization_url || data?.authorizationUrl;

      if (!reference) throw new Error('Payment reference missing');

      // If backend already marked it paid
      if (!authorizationUrl) {
        const paymentId: string | undefined = data?.payment_id || data?.id || reference;
        const receiptUrl = paymentId ? apiUrl(`/api/v1/payments/${paymentId}/receipt`) : undefined;
        if (receiptUrl) safeSet(rcptKey(bookingRequestId), receiptUrl);
        finishSuccess({ status: 'paid', amount: Number(amount), paymentId, receiptUrl });
        return;
      }

      setPaystackReference(reference);

      // 2) Inline-first path if we have an email (Paystack requires email for inline)
      if (preferInline && (email && /\S+@\S+\.\S+/.test(email))) {
        try {
          setStatus('inline');
          await openPaystackInline({
            email,
            amountMajor: Number(amount),
            currency,
            reference,
            // enable common channels for a better UX (optional)
            channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money'],
            metadata: { bookingRequestId, serviceName, source: 'web_inline' },
            onSuccess: (ref) => {
              // Inline callback just returns the reference; actual confirmation via backend verify
              startVerifyLoop(ref);
            },
            onClose: () => {
              // user closed inline; allow retry or switch to hosted
              // keep modal open; show an option to open hosted
              setStatus('ready-hosted');
              setPaystackUrl(authorizationUrl);
            },
          });
          // If it opened, status is handled by callback/onClose above.
          return;
        } catch {
          // Inline failed (script blocked, key missing, popup blocked, etc.) -> fallback
        }
      }

      // 3) Hosted fallback (iframe)
      setPaystackUrl(authorizationUrl);
      setStatus('ready-hosted');
    } catch (err: any) {
      const statusCode = Number(err?.response?.status || 0);
      let msg = 'Payment failed. Please try again.';
      if (statusCode === 404) msg = 'This booking was not found or is not payable.';
      else if (statusCode === 403) msg = 'You are not allowed to pay for this booking.';
      else if (statusCode === 422) msg = 'Invalid payment attempt. Refresh and try again.';
      finishError(msg);
    }
  }, [status, amount, bookingRequestId, preferInline, email, currency, serviceName]);

  // Mount/unmount
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

  // Auto-start
  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }
    if (!autoStart || startedRef.current) return;
    startedRef.current = true;
    startPayment().catch(() => {
      setStatus('error');
      setPaystackUrl(null);
      setPaystackReference(null);
      setError('Could not start payment. Please try again.');
    });
  }, [open, autoStart, startPayment, resetState]);

  if (!open) return null;

  const loading = status === 'starting' || status === 'verifying';
  const showBanner = loading || !!error;

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

        {/* Inline requires email — show lightweight input if missing */}
        {preferInline && !customerEmail && (
          <div className="mb-3">
            <label className="block text-sm text-gray-700 mb-1">Email for receipt</label>
            <input
              type="email"
              autoComplete="email"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading || status === 'inline'}
            />
            <p className="mt-1 text-xs text-gray-500">
              Used for Paystack inline checkout. We’ll never share it.
            </p>
          </div>
        )}

        {showBanner && (
          <div className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-sm" role="status" aria-live="polite">
            {status === 'starting' && <span>Opening secure checkout…</span>}
            {status === 'inline' && <span>Waiting for Paystack popup…</span>}
            {status === 'verifying' && <span>Verifying payment…</span>}
            {status === 'error' && error && <span className="text-red-600">{error}</span>}
          </div>
        )}

        {/* Hosted fallback UI */}
        {status === 'ready-hosted' && paystackUrl && (
          <>
            <CheckoutFrame src={paystackUrl} />
            <div className="mt-2 text-xs text-gray-500">
              Having trouble?{' '}
              <a
                href={paystackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-blue-600 hover:text-blue-800"
              >
                Open checkout in a new tab
              </a>
            </div>
          </>
        )}

        {/* Idle message */}
        {!loading && !error && !paystackUrl && status !== 'inline' && (
          <div className="text-sm text-gray-600">
            <p>Preparing checkout… If nothing happens, try again.</p>
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
              disabled={loading || (preferInline && !email)}
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
