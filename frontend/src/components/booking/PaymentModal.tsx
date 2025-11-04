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
const PAYSTACK_PK =
  process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || process.env.NEXT_PUBLIC_PAYSTACK_PK;

/* =========================
 * Helpers
 * ========================= */
const loadPaystackInlineScript = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  if ((window as any).PaystackPop) return;

  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://js.paystack.co/v1/inline.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Paystack script'));
    document.body.appendChild(s);
  });
};

const interpretStatus = (payload: any, fallback: string, pendingMsg: string) => {
  try {
    const statusHint =
      (typeof payload?.status === 'string' && payload.status) ||
      (typeof payload?.detail?.status === 'string' && payload.detail.status) ||
      (typeof payload?.detail === 'string' && payload.detail) ||
      '';
    const hint = statusHint.toLowerCase();

    if (hint.includes('failed') || hint.includes('declin')) {
      return 'Payment declined. Please retry the payment.';
    }
    if (hint.includes('cancel') || hint.includes('abandon')) {
      return 'Checkout cancelled before completion. Continue in the payment window when you are ready.';
    }
    if (hint.includes('pending') || hint.includes('processing')) {
      return pendingMsg;
    }
  } catch {
    // ignore parse errors; fall back to default messaging
  }
  return fallback;
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
}) => {
  // UI state
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
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
    setVerifying(false);
    onClose();
  }, [onClose]);

  const launchInlinePaystack = useCallback(
    async ({
      reference,
      authorizationUrl,
    }: {
      reference: string;
      authorizationUrl?: string | null;
    }): Promise<boolean> => {
      try {
        await loadPaystackInlineScript();
        const PaystackPop = (window as any).PaystackPop;

        if (PaystackPop && typeof PaystackPop.setup === 'function') {
          const amountKobo = Math.round(Math.max(0, Number(amount || 0)) * 100);
          const handler = PaystackPop.setup({
            key: PAYSTACK_PK,
            email: 'client@booka.local',
            amount: amountKobo,
            currency: 'ZAR',
            ref: reference,
            reference,
            metadata: { booking_request_id: bookingRequestId },
            callback: async (transaction: { reference?: string; status?: string }) => {
              try {
                setVerifying(true);
                const ref = transaction?.reference || reference;
                const verifyUrl = `/api/v1/payments/paystack/verify?reference=${encodeURIComponent(
                  ref,
                )}`;
                const resp = await fetch(verifyUrl, { credentials: 'include' as RequestCredentials });

                if (resp.ok) {
                  const v = await resp.json();
                  const pid = v?.payment_id || ref;
                const receiptUrl = `/api/v1/payments/${pid}/receipt`;
                try {
                  localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl);
                } catch {}
                setPaystackUrl(null);
                setPaystackReference(null);
                onSuccess({ status: 'paid', amount: Number(amount), paymentId: pid, receiptUrl });
                return;
              }

                let message = 'Payment not completed yet. Return to the checkout window.';
                try {
                  const payload = await resp.json();
                  message = interpretStatus(
                    payload,
                    message,
                    'Payment is still pending. Leave the checkout window open until it completes.',
                  );
                } catch {
                  if (resp.status === 400) {
                    message = 'Payment is still pending. Leave the checkout window open until it completes.';
                  }
                }
                setError(message);
              } catch {
                setError('Verification failed. Reopen the payment window if it was closed.');
              } finally {
                setVerifying(false);
              }
            },
            onClose: () => {
              setError('Payment window closed before completion. Continue in the checkout window when you are ready.');
            },
          });

          if (handler && typeof handler.openIframe === 'function') {
            handler.openIframe();
            setLoading(false);
            return true;
          }
        }
      } catch {
        // inline setup failed
      }

      if (authorizationUrl) {
        setError(null);
        setPaystackUrl(authorizationUrl);
        setLoading(false);
        return false;
      }

      const msg = 'Unable to launch checkout. Please try again.';
      setError(msg);
      onError(msg);
      setLoading(false);
      return false;
    },
    [amount, bookingRequestId, onSuccess, onError, PAYSTACK_PK],
  );

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

      setPaystackReference(reference);

      // If we have a public key, attempt inline first (falls back to hosted checkout on failure).
      if (USE_PAYSTACK && PAYSTACK_PK) {
        const launched = await launchInlinePaystack({
          reference,
          authorizationUrl: authorizationUrl || null,
        });
        if (launched) return;
        if (authorizationUrl) {
          // launchInlinePaystack already set fallback iframe and loading state
          return;
        }
        // Inline failed without a fallback; bail after error handling.
        return;
      }

      // Hosted fallback when inline is disabled
      if (authorizationUrl) {
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
  }, [bookingRequestId, amount, onSuccess, onError, launchInlinePaystack, loading]);

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

  // Poll verify endpoint when using hosted fallback (iframe)
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
          setVerifying(false);
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
      setVerifying(false);
      return;
    }

    if (autoRunRef.current) return;
    autoRunRef.current = true;

    handlePay().catch(() => {
      setLoading(false);
      setPaystackUrl(null);
      setPaystackReference(null);
      setVerifying(false);
    });
  }, [open, handlePay]);

  /* -------------------------
   * Render
   * ------------------------- */
  if (!open) return null;

  const showStatusBanner = Boolean(error || verifying || loading);

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
            <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
              {loading && <span>Opening secure checkout…</span>}
              {!loading && verifying && <span>Verifying payment status…</span>}
              {!loading && !verifying && error && (
                <span className="text-red-600">{error}</span>
              )}
            </div>
          )}

          {paystackUrl && (
            <div className="rounded-md border overflow-hidden">
              <iframe
                title="Paystack Checkout"
                src={paystackUrl}
                className="w-full h-[560px] border-0"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
