// components/booking/PaymentModal.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPayment, apiUrl } from '@/lib/api';
import { openPaystackInline } from '@/utils/paystackClient';

const PAYSTACK_ENABLED = process.env.NEXT_PUBLIC_USE_PAYSTACK === '1';
const BACKOFF_STEPS = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 8000];

const rcptKey = (bookingRequestId: number) => `receipt_url:br:${bookingRequestId}`;
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

async function verifyPaystack(reference: string, bookingRequestId: number, signal?: AbortSignal) {
  const url = apiUrl(`/api/v1/payments/paystack/verify?reference=${encodeURIComponent(reference)}&booking_request_id=${encodeURIComponent(String(bookingRequestId))}`);
  const resp = await fetch(url, { credentials: 'include', signal });
  if (!resp.ok) return { ok: false as const };
  const v = await resp.json();
  const paymentId = v?.payment_id || reference;
  const receiptUrl = `/receipts/${paymentId}`;
  safeSet(rcptKey(bookingRequestId), receiptUrl);
  return { ok: true as const, paymentId, receiptUrl };
}

type PaymentStatus = 'idle' | 'starting' | 'inline' | 'verifying' | 'error';

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
  serviceName?: string;           // accepted but not displayed
  /** Try inline popup first (recommended) */
  preferInline?: boolean;
  /** If provided, we will attempt inline; otherwise fallback to hosted immediately. */
  customerEmail?: string;
  /** Currency code, defaults to NGN */
  currency?: string;
  /** Start checkout automatically when opened (default: true) */
  autoStart?: boolean;
  /** Allow clicking backdrop to close (default: true) */
  dismissOnBackdrop?: boolean;
}

// Inline‑only flow; hosted iframe removed per product decision.

const PaymentModal: React.FC<PaymentModalProps> = ({
  open,
  onClose,
  bookingRequestId,
  onSuccess,
  onError,
  amount,
  serviceName: _unusedServiceName,
  preferInline = true,
  customerEmail,
  currency = 'ZAR',
  autoStart = true,
  dismissOnBackdrop = true,
}) => {
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const [paystackReference, setPaystackReference] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);
  const verifyAbortRef = useRef<AbortController | null>(null);
  const isMounted = useRef(true);

  const resetState = useCallback(() => {
    setStatus('idle');
    setError(null);
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

  /** Inline-first (if email provided), otherwise hosted — opens immediately */
  const startPayment = useCallback(async () => {
    if (status === 'starting' || status === 'inline' || status === 'verifying') return;

    setStatus('starting');
    setError(null);
    setPaystackReference(null);

    if (!PAYSTACK_ENABLED) {
      finishError('Paystack is not enabled.');
      return;
    }

    try {
      // 1) Backend init: get reference + authorization_url
      const res = await createPayment({
        booking_request_id: bookingRequestId,
        amount: Number(amount),
        full: true,
      });

      const data = res?.data || {};
      const reference: string = String(data?.reference || data?.payment_id || '').trim();
      const authorizationUrl: string | undefined = data?.authorization_url || data?.authorizationUrl;
      const accessCode: string | undefined = data?.access_code || data?.accessCode;

      if (!reference) throw new Error('Payment reference missing');
      // Cache reference for adjacent views that may try to build receipt URLs optimistically
      try { localStorage.setItem(`receipt_ref:br:${bookingRequestId}`, reference); } catch {}

      // Already paid?
      if (!authorizationUrl) {
        const paymentId: string | undefined = data?.payment_id || data?.id || reference;
        const receiptUrl = paymentId ? `/receipts/${paymentId}` : undefined;
        if (receiptUrl) safeSet(rcptKey(bookingRequestId), receiptUrl);
        finishSuccess({ status: 'paid', amount: Number(amount), paymentId, receiptUrl });
        return;
      }

      setPaystackReference(reference);

      // 2) Inline preferred (if email present); otherwise hosted fallback
      const hasEmail = Boolean(customerEmail && /\S+@\S+\.\S+/.test(customerEmail));
      if (preferInline && hasEmail) {
        try {
          setStatus('inline');
          await openPaystackInline({
            email: customerEmail!, // safe due to hasEmail
            amountMajor: Number(amount),
            currency,
            // Bind popup to the server-initialized transaction reference
            reference: reference,
            channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money'],
            metadata: { bookingRequestId, source: 'web_inline' },
            // Verify with the initialization reference we stored (DB payment_id)
            onSuccess: (_cbRef) => startVerifyLoop(reference),
            onClose: () => {
              // Hosted fallback to avoid inline runtime issues (e.g., Paystack UI errors)
              if (authorizationUrl) {
                try { window.open(authorizationUrl, '_blank'); } catch {}
                setStatus('verifying');
                startVerifyLoop(reference);
              } else {
                setStatus('error');
                setError('Checkout closed. Please try again.');
              }
            },
          });
          return;
        } catch {
          // Inline failed — hosted fallback
          if (authorizationUrl) {
            try { window.open(authorizationUrl, '_blank'); } catch {}
            setStatus('verifying');
            startVerifyLoop(reference);
            return;
          }
          setStatus('error');
          setError('Could not open Paystack popup. Please try again.');
          return;
        }
      }

      // Hosted fallback when inline is not available or email invalid
      if (authorizationUrl) {
        try { window.open(authorizationUrl, '_blank'); } catch {}
        setStatus('verifying');
        startVerifyLoop(reference);
        return;
      }
      setStatus('error');
      setError('A valid email is required to start payment.');
    } catch (err: any) {
      const statusCode = Number(err?.response?.status || 0);
      let msg = 'Payment failed. Please try again.';
      if (statusCode === 404) msg = 'This booking was not found or is not payable.';
      else if (statusCode === 403) msg = 'You are not allowed to pay for this booking.';
      else if (statusCode === 422) msg = 'Invalid payment attempt. Refresh and try again.';
      finishError(msg);
    }
  }, [status, amount, bookingRequestId, preferInline, customerEmail, currency]);

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

  // Auto-start (open immediately)
  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }
    if (!autoStart || startedRef.current) return;
    startedRef.current = true;
    startPayment().catch(() => {
      setStatus('error');
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
      aria-modal="true"
      role="dialog"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-4 mx-2 max-h-[90vh] overflow-y-auto outline-none"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Banner with spinner */}
        {showBanner && (
          <div
            className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-sm flex flex-col items-center justify-center"
            role="status"
            aria-live="polite"
          >
            {status === 'starting' && (
              <>
                <span>Opening secure checkout…</span>
                <div
                  className="mt-2 w-5 h-5 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin"
                  aria-hidden="true"
                />
              </>
            )}
            {status === 'inline' && <span>Waiting for Paystack popup…</span>}
            {status === 'verifying' && <span>Verifying payment…</span>}
            {status === 'error' && error && <span className="text-red-600">{error}</span>}
          </div>
        )}

        {/* Idle placeholder */}
        {!loading && !error && status !== 'inline' && (
          <div className="text-sm text-gray-600">
            <p>Preparing checkout…</p>
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
          {/* Optional manual trigger if autoStart=false */}
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
