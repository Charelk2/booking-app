import React, { useState, useEffect, useRef, useCallback } from 'react';
import Button from '../ui/Button';
import TextInput from '../ui/TextInput';
import { createPayment } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';
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
  providerName,
  serviceName,
}) => {
  // Check the environment variable at runtime so tests can override it
  const FAKE_PAYMENTS = process.env.NEXT_PUBLIC_FAKE_PAYMENTS === '1';
  const USE_PAYSTACK = process.env.NEXT_PUBLIC_USE_PAYSTACK === '1';
  const PAYSTACK_PK = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || process.env.NEXT_PUBLIC_PAYSTACK_PK;
  const [full] = useState(true); // always full amount
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paystackUrl, setPaystackUrl] = useState<string | null>(null); // legacy iframe path (unused with inline)
  const [paystackReference, setPaystackReference] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const pollTimerRef = useRef<number | null>(null);
  const modalRef = useRef<HTMLFormElement | null>(null);
  const autoRunRef = useRef(false);

  useEffect(() => {}, [open]);

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
        onClose();
      }
    };
    document.addEventListener('keydown', trap);
    (first || modal).focus();
    return () => {
      document.removeEventListener('keydown', trap);
    };
  }, [open, onClose]);

  // Trigger payment via backend (Paystack or fallback)
  const refreshVerify = useCallback(async () => {
    if (!paystackReference) return;
    setVerifying(true);
    setError(null);
    try {
      const verifyUrl = apiUrl(`/api/v1/payments/paystack/verify?reference=${encodeURIComponent(paystackReference)}`);
      const resp = await fetch(verifyUrl, { credentials: 'include' as RequestCredentials });
      if (resp.ok) {
        const v = await resp.json();
        const pid = v?.payment_id || paystackReference;
        const receiptUrl = apiUrl(`/api/v1/payments/${pid}/receipt`);
        try { localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl); } catch {}
        onSuccess({ status: 'paid', amount: Number(amount), paymentId: pid, receiptUrl });
        return;
      }
      // Non-200: likely not completed yet
      const code = resp.status;
      if (code === 400) {
        setError('Payment not completed yet. Please finish checkout, then click Refresh.');
      } else {
        setError('Could not verify payment. Try again in a few seconds.');
      }
    } catch (e) {
      setError('Network issue while verifying. Please try again.');
    } finally {
      setVerifying(false);
    }
  }, [paystackReference, bookingRequestId, amount, onSuccess]);

  // Trigger payment via backend (Paystack or fallback)
  const handlePay = async () => {
    if (loading || paystackUrl) return;
    setLoading(true);
    setError(null);
    // If Paystack is enabled, do not use fake payments even if the flag is set
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
        // Initialize a Paystack transaction on the backend to create and persist the reference
        const res = await createPayment({ booking_request_id: bookingRequestId, amount: Number(amount), full: true });
        const data = res.data as any;
        const reference = String(data?.reference || data?.payment_id || '');
        if (!reference) {
          throw new Error('Payment reference missing');
        }
        setPaystackReference(reference);

        // Load Paystack inline script
        const loadPaystack = async (): Promise<void> => {
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

        let inlineReady = false;
        try {
          await loadPaystack();
          const PaystackPop = (window as any).PaystackPop;
          if (PaystackPop && typeof PaystackPop.setup === 'function') {
            inlineReady = true;
            const amountKobo = Math.round(Math.max(0, Number(amount || 0)) * 100);
            const handler = PaystackPop.setup({
          key: PAYSTACK_PK,
          email: 'client@booka.local',
          amount: amountKobo,
          currency: 'ZAR',
          ref: reference,
          reference,
          metadata: { booking_request_id: bookingRequestId },
          callback: async (response: { reference: string }) => {
            try {
              setVerifying(true);
              const ref = response?.reference || reference;
              const verifyUrl = `/api/v1/payments/paystack/verify?reference=${encodeURIComponent(ref)}`;
              const resp = await fetch(verifyUrl, { credentials: 'include' as RequestCredentials });
              if (resp.ok) {
                const v = await resp.json();
                const pid = v?.payment_id || ref;
                const receiptUrl = `/api/v1/payments/${pid}/receipt`;
                try { localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl); } catch {}
                onSuccess({ status: 'paid', amount: Number(amount), paymentId: pid, receiptUrl });
              } else {
                setError('Payment not completed. Please try again or use Refresh.');
              }
            } catch (e: any) {
              setError('Verification failed. Please click Refresh Status.');
            } finally {
              setVerifying(false);
            }
          },
          onClose: () => {
            // Keep the modal open; allow user to retry or refresh
          },
            });
            handler.openIframe();
            setLoading(false);
            return;
          }
        } catch (e) {
          // fall through to iframe embed
        }
        // Inline not available or failed to load - embed iframe as fallback
        const auth = (res?.data as any)?.authorization_url as string | undefined;
        if (auth) {
          setPaystackUrl(auth);
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
      // If backend returned Paystack redirect details, honor them even if USE_PAYSTACK is off
      const authUrl = data?.authorization_url as (string | undefined);
      const reference = String(data?.reference || data?.payment_id || '').trim();
      if (authUrl && reference) {
        setPaystackReference(reference);
        if (PAYSTACK_PK) {
          // Try inline overlay even if the flag wasn't set at build time
          try {
            const loadPaystack = async (): Promise<void> => {
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
            await loadPaystack();
            const PaystackPop = (window as any).PaystackPop;
            if (!PaystackPop || typeof PaystackPop.setup !== 'function') {
              // Inline not available: embed iframe
              setPaystackUrl(authUrl);
              setLoading(false);
              return;
            }
            const handler = PaystackPop.setup({
              key: PAYSTACK_PK,
              email: 'client@booka.local',
              amount: Math.round(Math.max(0, Number(amount || 0)) * 100),
              currency: 'ZAR',
              ref: reference,
              reference,
              callback: async (resp: { reference: string }) => {
                const ref = resp?.reference || reference;
                const verifyUrl = `/api/v1/payments/paystack/verify?reference=${encodeURIComponent(ref)}`;
                const v = await fetch(verifyUrl, { credentials: 'include' as RequestCredentials });
                if (v.ok) {
                  const body = await v.json();
                  const pid = body?.payment_id || ref;
                  const rurl = `/api/v1/payments/${pid}/receipt`;
                  try { localStorage.setItem(`receipt_url:br:${bookingRequestId}`, rurl); } catch {}
                  onSuccess({ status: 'paid', amount: Number(amount), paymentId: pid, receiptUrl: rurl });
                } else {
                  setError('Payment not completed. Click Refresh Status after finishing checkout.');
                }
              },
              onClose: () => {},
            });
            handler.openIframe();
            setLoading(false);
            return;
          } catch {
            // Fallback to iframe below
          }
        }
        // No inline: embed authorization_url as iframe
        setPaystackUrl(authUrl);
        setLoading(false);
        return;
      }
      // No Paystack redirect: treat as immediate success (fake or direct capture gateway)
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
        // Surface a helpful error instead of auto‑mocking when the backend returns 4xx
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
  };

  // Iframe fallback: gently poll verify so localhost completes without manual refresh
  useEffect(() => {
    if (!paystackUrl || !paystackReference) return;
    let elapsed = 0;
    const INTERVAL = 5000;
    const MAX = 60000; // 1 minute max
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
      } catch {}
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

  // Auto-run disabled: only start after user clicks Pay

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center overflow-y-auto z-[200]">
      <form
        ref={modalRef}
        onSubmit={(e) => {
          e.preventDefault();
          handlePay();
        }}
        className="bg-white rounded-lg shadow-lg w-full max-w-sm p-4 mx-2 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-lg font-semibold mb-1">Checkout with Paystack</h2>
        {/* Provider name intentionally not shown */}
        <div className="space-y-2">
          {serviceName && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Service</span>
              <span className="text-sm text-gray-900">{serviceName}</span>
            </div>
          )}
          {loading && !paystackUrl && (
            <div className="text-[13px] text-gray-700 flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin" aria-hidden />
              Connecting to Paystack…
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {paystackUrl && (
            <div className="mt-2">
              <iframe
                title="Paystack Checkout"
                src={paystackUrl}
                className="w-full h-[560px] border rounded-md"
              />
              <div className="mt-2 text-[12px] text-gray-600">If the checkout is blocked, continue in a new tab.</div>
              <div className="mt-3 flex items-center gap-2">
                <a href={paystackUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-lg font-semibold min-h-10 px-3 py-2 text-sm bg-brand text-white hover:bg-brand-dark/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus:ring-brand-dark">
                  Continue in new tab
                </a>
                <Button type="button" onClick={refreshVerify} isLoading={verifying}>
                  Refresh Status
                </Button>
                <Button type="button" variant="secondary" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
        {!paystackUrl && (
          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={loading}>
              Pay
            </Button>
          </div>
        )}
      </form>
    </div>
  );
};

export default PaymentModal;
