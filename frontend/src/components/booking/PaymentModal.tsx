import React, { useState, useEffect, useRef, useCallback } from 'react';
import Button from '../ui/Button';
import { createPayment, apiUrl } from '@/lib/api';

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
  serviceName?: string;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  open,
  onClose,
  bookingRequestId,
  onSuccess,
  onError,
  amount,
  serviceName,
}) => {
  const FAKE_PAYMENTS = process.env.NEXT_PUBLIC_FAKE_PAYMENTS === '1';
  const USE_PAYSTACK = process.env.NEXT_PUBLIC_USE_PAYSTACK === '1';
  const PAYSTACK_PK = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || process.env.NEXT_PUBLIC_PAYSTACK_PK;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paystackUrl, setPaystackUrl] = useState<string | null>(null);
  const [paystackReference, setPaystackReference] = useState<string | null>(null);
  const [paystackAccessCode, setPaystackAccessCode] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [inlineBlocked, setInlineBlocked] = useState(false);
  const pollTimerRef = useRef<number | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const autoRunRef = useRef(false);

  const handleCancel = useCallback(() => {
    const confirmCancel = window.confirm('Cancel and return? You can restart payment anytime.');
    if (!confirmCancel) return;
    autoRunRef.current = false;
    onClose();
  }, [onClose]);

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
            last.focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    };

    document.addEventListener('keydown', trap);
    first.focus();
    return () => document.removeEventListener('keydown', trap);
  }, [open, handleCancel]);

  const interpretStatus = (payload: any, fallback: string, pendingMsg: string): string => {
    try {
      const statusHint = payload?.status || payload?.detail?.status || payload?.detail || '';
      const hint = String(statusHint).toLowerCase();
      if (hint.includes('failed') || hint.includes('declin')) {
        return 'Payment declined. Try again.';
      }
      if (hint.includes('cancel') || hint.includes('abandon')) {
        return 'Checkout cancelled. Try again when ready.';
      }
      if (hint.includes('pending') || hint.includes('processing')) {
        return pendingMsg;
      }
    } catch {}
    return fallback;
  };

  const loadPaystack = useCallback(async (): Promise<void> => {
    if (typeof window === 'undefined' || (window as any).PaystackPop) return;
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://js.paystack.co/v2/inline.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Paystack script'));
      document.body.appendChild(script);
    });
  }, []);

  const handlePay = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setInlineBlocked(false);
    setPaystackUrl(null);
    setPaystackReference(null);
    setPaystackAccessCode(null);

    try {
      if (FAKE_PAYMENTS && !USE_PAYSTACK) {
        const fakeId = `fake_${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
        const receiptUrl = apiUrl(`/api/v1/payments/${fakeId}/receipt`);
        localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl);
        onSuccess({ status: 'paid', amount, receiptUrl, paymentId: fakeId, mocked: true });
        return;
      }

      const res = await createPayment({ booking_request_id: bookingRequestId, amount, full: true });
      const data = res.data;
      const reference = String(data?.reference || data?.payment_id || '').trim();
      const authorizationUrl = data?.authorization_url as string | undefined;
      const accessCode = String(data?.access_code || data?.accessCode || '').trim();
      const paymentId = data?.payment_id as string | undefined;

      if (!reference) throw new Error('Payment reference missing');

      if (authorizationUrl || accessCode) {
        if (!PAYSTACK_PK) throw new Error('Paystack public key missing');

        setPaystackReference(reference);
        setPaystackAccessCode(accessCode || null);

        if (accessCode) {
          await loadPaystack();
          const PaystackPop = (window as any).PaystackPop;
          if (!PaystackPop) throw new Error('Paystack library not loaded');

          const paystack = new PaystackPop();
          paystack.newTransaction({
            key: PAYSTACK_PK,
            email: 'client@booka.local',
            amount: Math.round(Math.max(0, Number(amount || 0)) * 100),
            currency: 'ZAR',
            reference,
            access_code: accessCode,
            metadata: { booking_request_id: bookingRequestId },
            onSuccess: async (transaction: { reference: string }) => {
              setVerifying(true);
              const ref = transaction?.reference || reference;
              const verifyUrl = apiUrl(`/api/v1/payments/paystack/verify?reference=${encodeURIComponent(ref)}`);
              try {
                const resp = await fetch(verifyUrl, { credentials: 'include' });
                if (resp.ok) {
                  const v = await resp.json();
                  const pid = v?.payment_id || ref;
                  const receiptUrl = apiUrl(`/api/v1/payments/${pid}/receipt`);
                  localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl);
                  onSuccess({ status: 'paid', amount, receiptUrl, paymentId: pid });
                  return;
                }
                let message = 'Payment not completed yet.';
                const payload = await resp.json().catch(() => ({}));
                message = interpretStatus(payload, message, 'Payment pending. Wait for completion.');
                setError(message);
                if (authorizationUrl) {
                  setInlineBlocked(true);
                  setPaystackUrl(authorizationUrl);
                }
              } catch {
                setError('Verification failed.');
              } finally {
                setVerifying(false);
              }
            },
            onCancel: () => {
              setError('Payment cancelled.');
              if (authorizationUrl) {
                setInlineBlocked(true);
                setPaystackUrl(authorizationUrl);
              }
            },
            onError: (err: any) => {
              setError(`Error: ${err?.message || 'Unknown error'}`);
              setInlineBlocked(true);
              if (authorizationUrl) {
                setPaystackUrl(authorizationUrl);
              }
            },
          });
          return;
        } else if (authorizationUrl) {
          setPaystackUrl(authorizationUrl);
          return;
        } else {
          throw new Error('Missing Paystack access code or authorization URL');
        }
      } else if (paymentId) {
        const receiptUrl = apiUrl(`/api/v1/payments/${paymentId}/receipt`);
        localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl);
        onSuccess({ status: 'paid', amount, receiptUrl, paymentId });
        return;
      } else {
        throw new Error('Invalid payment response');
      }
    } catch (err: any) {
      console.error(err);
      if (FAKE_PAYMENTS && !USE_PAYSTACK) {
        const fakeId = `test_${Date.now().toString(16)}${Math.random().toString(16).slice(2, 8)}`;
        const receiptUrl = apiUrl(`/api/v1/payments/${fakeId}/receipt`);
        localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl);
        onSuccess({ status: 'paid', amount, receiptUrl, paymentId: fakeId, mocked: true });
      } else {
        const status = err?.response?.status || 0;
        let msg = 'Payment failed. Try again later.';
        if (status === 404) msg = 'Booking not ready or not found.';
        else if (status === 403) msg = 'Not allowed to pay for this booking.';
        else if (status === 422) msg = 'Invalid payment attempt. Refresh and try again.';
        setError(msg);
        onError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [loading, FAKE_PAYMENTS, USE_PAYSTACK, PAYSTACK_PK, bookingRequestId, amount, onSuccess, onError]);

  useEffect(() => {
    if (!paystackUrl || !paystackReference) return;

    let elapsed = 0;
    const INTERVAL = 5000;
    const MAX = 60000 * 5; // Extend to 5 minutes for fallback
    const tick = async () => {
      try {
        const verifyUrl = apiUrl(`/api/v1/payments/paystack/verify?reference=${encodeURIComponent(paystackReference)}`);
        const resp = await fetch(verifyUrl, { credentials: 'include' });
        if (resp.ok) {
          const v = await resp.json();
          const pid = v?.payment_id || paystackReference;
          const receiptUrl = apiUrl(`/api/v1/payments/${pid}/receipt`);
          localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl);
          onSuccess({ status: 'paid', amount, receiptUrl, paymentId: pid });
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          return;
        }
      } catch {}
      elapsed += INTERVAL;
      if (elapsed >= MAX && pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        setError('Verification timed out. Check your payment status manually.');
      }
    };

    pollTimerRef.current = window.setInterval(tick, INTERVAL) as unknown as number;
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [paystackUrl, paystackReference, bookingRequestId, amount, onSuccess]);

  useEffect(() => {
    if (!open) {
      autoRunRef.current = false;
      setLoading(false);
      setError(null);
      setInlineBlocked(false);
      setPaystackUrl(null);
      setPaystackReference(null);
      setPaystackAccessCode(null);
      setVerifying(false);
      return;
    }
    if (autoRunRef.current) return;
    autoRunRef.current = true;
    handlePay();
  }, [open, handlePay]);

  if (!open) return null;

  const showStatusBanner = Boolean(error || verifying || loading);
  const fallbackActive = inlineBlocked && paystackUrl;

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
              {verifying && <span>Verifying payment status…</span>}
              {error && <span className="text-red-600">{error}</span>}
            </div>
          )}

          {fallbackActive && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Inline checkout blocked or unavailable. Please complete payment in a new tab. Return here after to verify.
            </div>
          )}

          {fallbackActive && (
            <a
              href={paystackUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md font-semibold min-h-10 px-3 py-2 text-sm bg-brand text-white hover:bg-brand-dark/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-dark"
            >
              Open Secure Checkout
            </a>
          )}
        </div>

        {(error || fallbackActive) && (
          <div className="mt-6 flex justify-end">
            <Button type="button" onClick={handlePay} isLoading={loading || verifying}>
              Retry Payment
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentModal;