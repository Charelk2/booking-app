import React, { useState, useEffect, useRef, useCallback } from 'react';
import Button from '../ui/Button';
import { createPayment } from '@/lib/api';
import { apiUrl } from '@/lib/api';

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
  const [showFallbackBanner, setShowFallbackBanner] = useState(false);
  const pollTimerRef = useRef<number | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const autoRunRef = useRef(false);

  const handleCancel = useCallback(() => {
    if (typeof window !== 'undefined') {
      const confirmCancel = window.confirm('Cancel and return? You can restart payment anytime.');
      if (!confirmCancel) {
        return;
      }
    }
    autoRunRef.current = false;
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open || !modalRef.current) return undefined;

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

    document.addEventListener('keydown', trap);
    (first || modal).focus();
    return () => {
      document.removeEventListener('keydown', trap);
    };
  }, [open, handleCancel]);

  const interpretStatus = (payload: any, fallback: string, pendingMsg: string) => {
    try {
      const statusHint =
        (typeof payload?.status === 'string' && payload.status) ||
        (typeof payload?.detail?.status === 'string' && payload.detail.status) ||
        (typeof payload?.detail === 'string' && payload.detail) ||
        '';
      const hint = statusHint.toLowerCase();
      if (hint.includes('failed') || hint.includes('declin')) {
        return 'Payment declined. Reopen Paystack to try again.';
      }
      if (hint.includes('cancel') || hint.includes('abandon')) {
        return 'Checkout cancelled before completion. Reopen Paystack when you are ready.';
      }
      if (hint.includes('pending') || hint.includes('processing')) {
        return pendingMsg;
      }
    } catch {
      // ignore parse errors; fall back to default messaging
    }
    return fallback;
  };

  const handlePay = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setInlineBlocked(false);
    setShowFallbackBanner(false);
    setPaystackUrl(null);

    if (FAKE_PAYMENTS && !USE_PAYSTACK) {
      const fakeId = `fake_${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
      const receiptUrl = apiUrl(`/api/v1/payments/${fakeId}/receipt`);
      try { localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl); } catch {}
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
      if (USE_PAYSTACK && PAYSTACK_PK) {
        const res = await createPayment({ booking_request_id: bookingRequestId, amount: Number(amount), full: true });
        const data = res.data as any;
        const reference = String(data?.reference || data?.payment_id || '').trim();
        const authorizationUrl = (data?.authorization_url as string | undefined) || undefined;
        const accessCode = String(data?.access_code || data?.accessCode || '').trim();
        if (!reference) {
          throw new Error('Payment reference missing');
        }
        setPaystackReference(reference);
        setPaystackAccessCode(accessCode || null);

        const loadPaystack = async (): Promise<void> => {
          if (typeof window === 'undefined') return;
          if ((window as any).PaystackPop) return;
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://js.paystack.co/v2/inline.js';
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Failed to load Paystack script'));
            document.body.appendChild(s);
          });
        };

        if (!accessCode) {
          if (authorizationUrl) {
            setPaystackUrl(authorizationUrl);
            setPaystackAccessCode(null);
            setShowFallbackBanner(true);
            setLoading(false);
            return;
          }
          throw new Error('Paystack access code missing');
        }

        try {
          await loadPaystack();
          const PaystackPop = (window as any).PaystackPop;
          if (PaystackPop && typeof PaystackPop === 'function') {
            const paystack = new PaystackPop();
            const amountKobo = Math.round(Math.max(0, Number(amount || 0)) * 100);
            paystack.newTransaction({
              key: PAYSTACK_PK,
              email: 'client@booka.local',
              amount: amountKobo,
              currency: 'ZAR',
              reference,
              access_code: accessCode || undefined,
              metadata: { booking_request_id: bookingRequestId },
              onSuccess: async (transaction: { reference: string }) => {
                try {
                  setVerifying(true);
                  const ref = transaction?.reference || reference;
                  const verifyUrl = `/api/v1/payments/paystack/verify?reference=${encodeURIComponent(ref)}`;
                  const resp = await fetch(verifyUrl, { credentials: 'include' as RequestCredentials });
                  if (resp.ok) {
                    const v = await resp.json();
                    const pid = v?.payment_id || ref;
                    const receiptUrl = `/api/v1/payments/${pid}/receipt`;
                    try { localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl); } catch {}
                    onSuccess({ status: 'paid', amount: Number(amount), paymentId: pid, receiptUrl });
                    return;
                  }
                  let message = 'Payment not completed yet. Return to Paystack to finish.';
                  try {
                    const payload = await resp.json();
                    message = interpretStatus(payload, message, 'Payment is still pending. Leave Paystack open until it completes.');
                  } catch {
                    if (resp.status === 400) {
                      message = 'Payment is still pending. Leave Paystack open until it completes.';
                    }
                  }
                  setError(message);
                  if (authorizationUrl) {
                    setInlineBlocked(true);
                    setShowFallbackBanner(true);
                    setPaystackUrl(authorizationUrl);
                  }
                } catch {
                  setError('Verification failed. Reopen Paystack if the window closed.');
                } finally {
                  setVerifying(false);
                }
              },
              onCancel: () => {
                setError('Payment cancelled before completion. Reopen Paystack to finish.');
                if (authorizationUrl) {
                  setInlineBlocked(true);
                  setShowFallbackBanner(true);
                  setPaystackUrl(authorizationUrl);
                }
              },
            });
            setLoading(false);
            return;
          }
        } catch {
          setInlineBlocked(true);
        }

        if (authorizationUrl) {
          setPaystackUrl(authorizationUrl);
          setPaystackAccessCode(accessCode || null);
          setShowFallbackBanner(true);
          setLoading(false);
          return;
        }

        setError('Unable to launch Paystack checkout. Please try again.');
        setLoading(false);
        return;
      }

      const res = await createPayment({
        booking_request_id: bookingRequestId,
        amount: Number(amount),
        full: true,
      });
      const data = res.data as any;
      const authUrl = data?.authorization_url as (string | undefined);
      const reference = String(data?.reference || data?.payment_id || '').trim();
      const accessCode = String(data?.access_code || data?.accessCode || '').trim();
      if (authUrl && reference && PAYSTACK_PK) {
        setPaystackReference(reference);
        setPaystackAccessCode(accessCode || null);
        if (!accessCode) {
          setPaystackUrl(authUrl);
          setShowFallbackBanner(true);
          setLoading(false);
          return;
        }

        try {
          const loadPaystack = async (): Promise<void> => {
            if (typeof window === 'undefined') return;
            if ((window as any).PaystackPop) return;
            await new Promise<void>((resolve, reject) => {
              const s = document.createElement('script');
              s.src = 'https://js.paystack.co/v2/inline.js';
              s.async = true;
              s.onload = () => resolve();
              s.onerror = () => reject(new Error('Failed to load Paystack script'));
              document.body.appendChild(s);
            });
          };
          await loadPaystack();
          const PaystackPop = (window as any).PaystackPop;
          if (PaystackPop && typeof PaystackPop === 'function') {
            const paystack = new PaystackPop();
            paystack.newTransaction({
              key: PAYSTACK_PK,
              email: 'client@booka.local',
              amount: Math.round(Math.max(0, Number(amount || 0)) * 100),
              currency: 'ZAR',
              reference,
              access_code: accessCode || undefined,
              metadata: { booking_request_id: bookingRequestId },
              onSuccess: async (transaction: { reference: string }) => {
                const ref = transaction?.reference || reference;
                const verifyUrl = `/api/v1/payments/paystack/verify?reference=${encodeURIComponent(ref)}`;
                const v = await fetch(verifyUrl, { credentials: 'include' as RequestCredentials });
                if (v.ok) {
                  const body = await v.json();
                  const pid = body?.payment_id || ref;
                  const rurl = `/api/v1/payments/${pid}/receipt`;
                  try { localStorage.setItem(`receipt_url:br:${bookingRequestId}`, rurl); } catch {}
                  onSuccess({ status: 'paid', amount: Number(amount), paymentId: pid, receiptUrl: rurl });
                  return;
                }
                let message = 'Payment not completed yet. Return to Paystack to finish.';
                try {
                  const payload = await v.json();
                  message = interpretStatus(payload, message, 'Payment is still pending. Leave Paystack open until it completes.');
                } catch {
                  if (v.status === 400) {
                    message = 'Payment is still pending. Leave Paystack open until it completes.';
                  }
                }
                setError(message);
              },
              onCancel: () => {
                setError('Payment cancelled before completion. Reopen Paystack to finish.');
              },
            });
            setLoading(false);
            setShowFallbackBanner(false);
            return;
          }
        } catch {
          setInlineBlocked(true);
          setShowFallbackBanner(true);
        }
        setPaystackUrl(authUrl);
        setPaystackAccessCode(accessCode || null);
        setLoading(false);
        return;
      }

      const paymentId = (data as { payment_id?: string }).payment_id;
      const receiptUrl = paymentId ? apiUrl(`/api/v1/payments/${paymentId}/receipt`) : undefined;
      try { if (receiptUrl) localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl); } catch {}
      onSuccess({ status: 'paid', amount: Number(amount), receiptUrl, paymentId });
    } catch (err: any) {
      const status = Number(err?.response?.status || 0);
      if (FAKE_PAYMENTS && !USE_PAYSTACK) {
        console.warn('Payment API unavailable; simulating paid status (FAKE).', err);
        const hex = Math.random().toString(16).slice(2).padEnd(8, '0');
        const paymentId = `test_${Date.now().toString(16)}${hex}`;
        const receiptUrl = apiUrl(`/api/v1/payments/${paymentId}/receipt`);
        try { localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl); } catch {}
        onSuccess({ status: 'paid', amount: Number(amount), paymentId, receiptUrl, mocked: true });
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
  }, [FAKE_PAYMENTS, USE_PAYSTACK, PAYSTACK_PK, bookingRequestId, amount, onSuccess, onError, loading]);

  useEffect(() => {
    if (!paystackUrl || !paystackReference) return;
    let elapsed = 0;
    const INTERVAL = 5000;
    const MAX = 60000;
    const tick = async () => {
      try {
        const resp = await fetch(apiUrl(`/api/v1/payments/paystack/verify?reference=${encodeURIComponent(paystackReference)}`), { credentials: 'include' as RequestCredentials });
        if (resp.ok) {
          const v = await resp.json();
          const pid = v?.payment_id || paystackReference;
          const receiptUrl = apiUrl(`/api/v1/payments/${pid}/receipt`);
          try { localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl); } catch {}
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
    pollTimerRef.current = window.setInterval(tick, INTERVAL) as unknown as number;
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [paystackUrl, paystackReference, bookingRequestId, amount, onSuccess]);

  useEffect(() => {
    if (!open) {
      autoRunRef.current = false;
      setLoading(false);
      setError(null);
      setInlineBlocked(false);
      setShowFallbackBanner(false);
      setPaystackUrl(null);
      setPaystackReference(null);
      setPaystackAccessCode(null);
      setVerifying(false);
      return;
    }
    if (autoRunRef.current) return;
    autoRunRef.current = true;
    handlePay().catch(() => {
      setLoading(false);
      setInlineBlocked(true);
    });
  }, [open, handlePay]);

  if (!open) return null;

  const showStatusBanner = Boolean(error || verifying || (loading && !paystackUrl));
  const fallbackActive = inlineBlocked && showFallbackBanner && paystackUrl;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center overflow-y-auto z-60">
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
              {loading && !paystackUrl && <span>Opening secure checkout…</span>}
              {!loading && verifying && <span>Verifying payment status…</span>}
              {!loading && !verifying && error && <span className="text-red-600">{error}</span>}
            </div>
          )}

          {fallbackActive && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Your browser blocked the inline checkout. Use the secure window below or open it in a new tab.
            </div>
          )}

          {paystackUrl && (
            <>
              <div className="rounded-md border overflow-hidden">
                <iframe
                  title="Paystack Checkout"
                  src={paystackUrl}
                  className="w-full h-[560px] border-0"
                />
              </div>
              {fallbackActive && (
                <a
                  href={paystackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-md font-semibold min-h-10 px-3 py-2 text-sm bg-brand text-white hover:bg-brand-dark/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-dark"
                >
                  Open checkout in a new tab
                </a>
              )}
            </>
          )}
        </div>

        {fallbackActive && (
          <div className="mt-6 flex justify-end">
            <Button type="button" onClick={handlePay} isLoading={loading}>
              Reopen Paystack
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentModal;
