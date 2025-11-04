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
  mocked?: boolean;
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
}

/* =========================
 * Env Flags
 * ========================= */
const FAKE_PAYMENTS = process.env.NEXT_PUBLIC_FAKE_PAYMENTS === '1';
const USE_PAYSTACK = process.env.NEXT_PUBLIC_USE_PAYSTACK === '1';

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
}) => {
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paystackUrl, setPaystackUrl] = useState<string | null>(null);
  const [paystackReference, setPaystackReference] = useState<string | null>(null);

  // refs
  const pollTimerRef = useRef<number | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const autoRunRef = useRef(false);

  /* -------------------------
   * Handlers
   * ------------------------- */
  const handleCancel = useCallback(() => {
    if (typeof window !== 'undefined') {
      const confirmCancel = window.confirm('Cancel and return? You can restart payment anytime.');
      if (!confirmCancel) return;
    }
    autoRunRef.current = false;
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPaystackUrl(null);
    setPaystackReference(null);
    onClose();
  }, [onClose]);

  const handlePay = useCallback(async () => {
    if (loading) return;

    setLoading(true);
    setError(null);
    setPaystackUrl(null);
    setPaystackReference(null);

    // Fake mode, short-circuit success
    if (FAKE_PAYMENTS && !USE_PAYSTACK) {
      const fakeId = `fake_${Date.now().toString(16)}${Math.random()
        .toString(16)
        .slice(2, 10)}`;
      const receiptUrl = apiUrl(`/api/v1/payments/${fakeId}/receipt`);
      try {
        localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl);
      } catch {}
      onSuccess({
        status: 'paid',
        amount: Number(amount),
        receiptUrl,
        paymentId: fakeId,
        mocked: true,
      });
      setLoading(false);
      return;
    }

    try {
      // Server creates payment + (possibly) returns authorization URL
      const res = await createPayment({
        booking_request_id: bookingRequestId,
        amount: Number(amount),
        full: true,
      });
      const data = res.data as any;

      const reference = String(data?.reference || data?.payment_id || '').trim();
      const authorizationUrl = (data?.authorization_url as string | undefined) || undefined;

      if (!reference) throw new Error('Payment reference missing');

      // Hosted fallback (preferred flow)
      if (authorizationUrl) {
        setPaystackReference(reference);
        setPaystackUrl(authorizationUrl);
        setLoading(false);
        return;
      }

      // Direct, immediate success path (no URL to open)
      const paymentId = (data as { payment_id?: string }).payment_id;
      const receiptUrl = paymentId
        ? apiUrl(`/api/v1/payments/${paymentId}/receipt`)
        : undefined;
      try {
        if (receiptUrl) {
          localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl);
        }
      } catch {}
      setPaystackUrl(null);
      setPaystackReference(null);
      onSuccess({ status: 'paid', amount: Number(amount), receiptUrl, paymentId });
    } catch (err: any) {
      const status = Number(err?.response?.status || 0);

      if (FAKE_PAYMENTS && !USE_PAYSTACK) {
        console.warn('Payment API unavailable; simulating paid status (FAKE).', err);
        const hex = Math.random().toString(16).slice(2).padEnd(8, '0');
        const paymentId = `test_${Date.now().toString(16)}${hex}`;
        const receiptUrl = apiUrl(`/api/v1/payments/${paymentId}/receipt`);
        try {
          localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl);
        } catch {}
        onSuccess({
          status: 'paid',
          amount: Number(amount),
          paymentId,
          receiptUrl,
          mocked: true,
        });
      } else {
        let msg = 'Payment failed. Please try again later.';
        if (status === 404) msg = 'This booking is not ready for payment or was not found.';
        else if (status === 403) msg = 'You are not allowed to pay for this booking.';
        else if (status === 422) msg = 'Invalid payment attempt. Please refresh and try again.';
        setError(msg);
        onError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [bookingRequestId, amount, onSuccess, onError, loading]);

  /* -------------------------
   * Effects
   * ------------------------- */

  // Focus trap + ESC handling when open
  useEffect(() => {
    if (!open || !modalRef.current) return;

    const modal = modalRef.current;
    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            (last || first).focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          (first || last).focus();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    };

    document.addEventListener('keydown', trap as any);
    (first || modal).focus();

    return () => {
      document.removeEventListener('keydown', trap as any);
    };
  }, [open, handleCancel]);

  // Poll verify endpoint when waiting on hosted checkout
  useEffect(() => {
    if (!paystackUrl || !paystackReference) return;

    let elapsed = 0;
    const INTERVAL = 5000;
    const MAX = 60000;

    const tick = async () => {
      try {
        const resp = await fetch(
          apiUrl(
            `/api/v1/payments/paystack/verify?reference=${encodeURIComponent(paystackReference)}`,
          ),
          { credentials: 'include' as RequestCredentials },
        );

        if (resp.ok) {
          const v = await resp.json();
          const pid = v?.payment_id || paystackReference;
          const receiptUrl = apiUrl(`/api/v1/payments/${pid}/receipt`);
          try {
            localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl);
          } catch {}
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          setPaystackUrl(null);
          setPaystackReference(null);
          onSuccess({ status: 'paid', amount: Number(amount), paymentId: pid, receiptUrl });
          return;
        }
      } catch {
        // ignore network errors; continue polling until timeout
      }

      elapsed += INTERVAL;
      if (elapsed >= MAX && pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    tick();
    pollTimerRef.current = window.setInterval(tick, INTERVAL) as unknown as number;

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [paystackUrl, paystackReference, bookingRequestId, amount, onSuccess]);

  // Auto-run on open
  useEffect(() => {
    if (!open) {
      autoRunRef.current = false;
      setLoading(false);
      setError(null);
      setPaystackUrl(null);
      setPaystackReference(null);
      return;
    }

    if (autoRunRef.current) return;
    autoRunRef.current = true;

    handlePay().catch(() => {
      setLoading(false);
      setPaystackUrl(null);
      setPaystackReference(null);
    });
  }, [open, handlePay]);

  /* -------------------------
   * Render
   * ------------------------- */
  if (!open) return null;

  const showStatusBanner = Boolean(error || loading);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center overflow-y-auto z-[999999909]">
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-lg w-full max-w-sm p-4 mx-2 max-h-[90vh] overflow-y-auto focus:outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paystack-modal-heading"
      >
        {serviceName && (
          <div className="flex items-center justify-between text-sm text-gray-700 mb-3">
            <span>Service</span>
            <span className="text-gray-900">{serviceName}</span>
          </div>
        )}

        <div className="space-y-3">
          {showStatusBanner && (
            <div className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {loading && <span>Opening secure checkout…</span>}
              {!loading && error && <span className="text-red-600">{error}</span>}
            </div>
          )}

          {paystackUrl && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
              <div className="flex items-start gap-3">
                <span className="relative flex h-3 w-3 mt-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                </span>
                <div className="space-y-1">
                  <p className="font-medium text-emerald-900">Finalizing your booking…</p>
                  <p className="text-emerald-800">
                    Keep the Paystack window open while we finalize your booking. 
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
