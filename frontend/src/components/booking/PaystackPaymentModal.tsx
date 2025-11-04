'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import Button from '../ui/Button';
import { createPayment, apiUrl } from '@/lib/api';

interface PaymentSuccess {
  status: string;
  amount: number;
  receiptUrl?: string;
  paymentId?: string;
  mocked?: boolean;
}

interface PaystackPaymentModalProps {
  open: boolean;
  onClose: () => void;
  bookingRequestId: number;
  onSuccess: (result: PaymentSuccess) => void;
  onError: (msg: string) => void;
  amount: number;
  serviceName?: string;
  providerName?: string;
  customerEmail?: string;
  currency?: string;
}

type PaystackPopInstance = {
  newTransaction: (options: Record<string, unknown>) => void;
  resumeTransaction: (accessCode: string, callbacks: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    PaystackPop?: { new (): PaystackPopInstance };
  }
}

const ensurePaystackScript = async () => {
  if (typeof window === 'undefined') return;
  if (window.PaystackPop) return;

  const existing = document.querySelector<HTMLScriptElement>('script[data-paystack-inline="1"]');
  if (existing) {
    if (window.PaystackPop) return;
    await new Promise<void>((resolve, reject) => {
      if (existing.dataset.loaded === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => {
          existing.remove();
          reject(new Error('Failed to load Paystack InlineJS'));
        },
        { once: true },
      );
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v2/inline.js';
    script.async = true;
    script.dataset.paystackInline = '1';
    script.addEventListener('load', () => {
      script.dataset.loaded = '1';
      resolve();
    });
    script.addEventListener(
      'error',
      () => {
        script.remove();
        reject(new Error('Failed to load Paystack InlineJS'));
      },
      { once: true },
    );
    document.body.appendChild(script);
  });
};

const PaystackPaymentModal: FC<PaystackPaymentModalProps> = ({
  open,
  onClose,
  bookingRequestId,
  onSuccess,
  onError,
  amount,
  serviceName,
  providerName: _unusedProviderName,
  customerEmail,
  currency = process.env.NEXT_PUBLIC_PAYSTACK_CURRENCY || 'ZAR',
}) => {
  const FAKE_PAYMENTS = process.env.NEXT_PUBLIC_FAKE_PAYMENTS === '1';
  const USE_PAYSTACK = process.env.NEXT_PUBLIC_USE_PAYSTACK !== '0';
  const PAYSTACK_PK =
    process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || process.env.NEXT_PUBLIC_PAYSTACK_PK || '';

  const IS_TEST_KEY = PAYSTACK_PK?.startsWith('pk_test');

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [reference, setReference] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [fallbackActive, setFallbackActive] = useState(false);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);
  const createAbortRef = useRef<AbortController | null>(null);

  const amountNumber = useMemo(() => Number(amount || 0), [amount]);
  const formattedAmount = useMemo(() => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amountNumber);
    } catch {
      return `${amountNumber.toFixed(2)} ${currency}`;
    }
  }, [amountNumber, currency]);

  const persistReceiptUrl = (pid: string) => {
    const receiptUrl = apiUrl(`/api/v1/payments/${pid}/receipt`);
    try { localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl); } catch {}
    return receiptUrl;
  };

  const clearPoll = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const getPaystackInstance = useCallback(async () => {
    if (typeof window === 'undefined') return null;
    try {
      if (!window.PaystackPop) {
        await ensurePaystackScript();
      }
      return window.PaystackPop ? new window.PaystackPop() : null;
    } catch {
      return null;
    }
  }, []);

  const verifyReference = useCallback(
    async (ref: string) => {
      setVerifying(true);
      try {
        const resp = await fetch(apiUrl(`/api/v1/payments/paystack/verify?reference=${encodeURIComponent(ref)}`), {
          credentials: 'include' as RequestCredentials,
        });
        if (resp.ok) {
          const v = await resp.json();
          const pid = v?.payment_id || ref;
          const receiptUrl = persistReceiptUrl(pid);
          onSuccess({ status: 'paid', amount: amountNumber, paymentId: pid, receiptUrl });
          return true;
        }

        let message = 'Payment not completed yet. If a checkout window is open, please finish there.';
        try {
          const payload = await resp.json();
          const hint = `${payload?.status || payload?.detail || ''}`.toLowerCase();
          if (hint.includes('pending') || hint.includes('processing')) {
            message = 'Payment is still pending. Keep the Paystack window open until it completes.';
          }
        } catch {}
        setStatusMsg(message);
        return false;
      } catch {
        setStatusMsg('Network error while checking payment. We will retry shortly.');
        return false;
      } finally {
        setVerifying(false);
      }
    },
    [amountNumber, bookingRequestId, onSuccess],
  );

  const beginPolling = useCallback(
    (ref: string) => {
      clearPoll();
      let elapsed = 0;
      const INTERVAL = 4000;
      const MAX = 120000;
      pollTimerRef.current = window.setInterval(async () => {
        const ok = await verifyReference(ref);
        if (ok) {
          clearPoll();
        } else {
          elapsed += INTERVAL;
          if (elapsed >= MAX) clearPoll();
        }
      }, INTERVAL) as unknown as number;
    },
    [verifyReference],
  );

  const launchInline = useCallback(
    async (ac: string, ref: string) => {
      const popup = await getPaystackInstance();
      if (!popup) {
        setFallbackActive(true);
        if (authUrl) window.open(authUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      setStatusMsg('Opening secure Paystack checkout…');

      popup.resumeTransaction(ac, {
        onLoad: () => setStatusMsg(null),
        onSuccess: async (tx: { reference?: string }) => {
          const refToVerify = tx?.reference || ref;
          await verifyReference(refToVerify);
        },
        onCancel: () => {
          setErrorMsg('Payment cancelled before completion. You can try again.');
          if (authUrl) window.open(authUrl, '_blank', 'noopener,noreferrer');
          beginPolling(ref);
        },
        onError: (err: any) => {
          setErrorMsg(err?.message || 'Unable to open inline checkout.');
          setFallbackActive(true);
          if (authUrl) window.open(authUrl, '_blank', 'noopener,noreferrer');
          beginPolling(ref);
        },
      });
    },
    [authUrl, beginPolling, getPaystackInstance, verifyReference],
  );

  const startPayment = useCallback(async () => {
    if (!USE_PAYSTACK) return;

    setErrorMsg(null);
    setStatusMsg('Preparing checkout…');
    setFallbackActive(false);
    setReference(null);
    setAccessCode(null);
    setAuthUrl(null);

    if (!PAYSTACK_PK) {
      const msg = 'Paystack public key is not configured.';
      setErrorMsg(msg);
      onError(msg);
      return;
    }

    if (FAKE_PAYMENTS) {
      const fakeId = `fake_${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
      const receiptUrl = apiUrl(`/api/v1/payments/${fakeId}/receipt`);
      try { localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl); } catch {}
      onSuccess({ status: 'paid', amount: amountNumber, receiptUrl, paymentId: fakeId, mocked: true });
      return;
    }

    createAbortRef.current?.abort();
    const ac = new AbortController();
    createAbortRef.current = ac;

    setLoading(true);
    try {
      const res = await createPayment(
        { booking_request_id: bookingRequestId, amount: amountNumber, full: true },
        { signal: ac.signal },
      );
      const data: any = res?.data || {};
      const ref = String(data?.reference || data?.payment_id || '').trim();
      const acode = String(data?.access_code || data?.accessCode || '').trim();
      const auth = (data?.authorization_url as string) || null;

      if (!ref) throw new Error('Payment reference missing from server.');
      setReference(ref);
      setAccessCode(acode || null);
      setAuthUrl(auth);

      if (acode) {
        await launchInline(acode, ref);
      } else if (auth) {
        setFallbackActive(true);
        setStatusMsg('Secure checkout opened in this window.');
        beginPolling(ref);
      } else {
        throw new Error('Neither access_code nor authorization_url were returned.');
      }
    } catch (err: any) {
      const status = Number(err?.response?.status || 0);
      if (FAKE_PAYMENTS) {
        const hex = Math.random().toString(16).slice(2).padEnd(8, '0');
        const paymentId = `test_${Date.now().toString(16)}${hex}`;
        const receiptUrl = apiUrl(`/api/v1/payments/${paymentId}/receipt`);
        try { localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl); } catch {}
        onSuccess({ status: 'paid', amount: amountNumber, paymentId, receiptUrl, mocked: true });
      } else {
        let msg = 'Could not start payment. Please try again.';
        if (status === 404) msg = 'This booking is not ready for payment or was not found.';
        else if (status === 403) msg = 'You are not allowed to pay for this booking.';
        else if (status === 422) msg = 'Invalid payment attempt. Please refresh and try again.';
        setErrorMsg(msg);
        onError(msg);
      }
    } finally {
      setLoading(false);
      setStatusMsg(null);
    }
  }, [
    USE_PAYSTACK,
    PAYSTACK_PK,
    FAKE_PAYMENTS,
    bookingRequestId,
    amountNumber,
    onSuccess,
    onError,
    launchInline,
    beginPolling,
  ]);

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
        onClose();
      }
    };

    document.addEventListener('keydown', trap);
    (first || modal).focus();
    return () => document.removeEventListener('keydown', trap);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      clearPoll();
      createAbortRef.current?.abort();
      createAbortRef.current = null;
      setStatusMsg(null);
      setErrorMsg(null);
      setLoading(false);
      setVerifying(false);
      setFallbackActive(false);
      setReference(null);
      setAccessCode(null);
      setAuthUrl(null);
      mountedRef.current = false;
      return;
    }
    if (mountedRef.current) return;
    mountedRef.current = true;
    startPayment();
  }, [open, startPayment]);

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && reference) {
        verifyReference(reference);
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [reference, verifyReference]);

  if (!open) return null;

  const showBanner = !!(statusMsg || errorMsg || verifying || loading);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center overflow-y-auto z-[999999909]">
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-lg w-full max-w-sm p-4 mx-2 max-h-[90vh] overflow-y-auto focus:outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paystack-modal-heading"
      >
        <div className="flex items-start justify-between mb-3">
          <h2 id="paystack-modal-heading" className="text-base font-semibold text-gray-900">
            Secure payment
          </h2>
          <button
            onClick={onClose}
            className="ml-3 inline-flex items-center rounded-md px-2 py-1 text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400"
          >
            Close
          </button>
        </div>

        {IS_TEST_KEY && (
          <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            TEST MODE — use Paystack test cards
          </div>
        )}

        {serviceName && (
          <div className="flex items-center justify-between text-sm text-gray-700 mb-2">
            <span>Service</span>
            <span className="text-gray-900">{serviceName}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-sm text-gray-700 mb-4">
          <span>Amount due</span>
          <span className="text-gray-900 font-medium">{formattedAmount}</span>
        </div>

        {showBanner && (
          <div
            className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm"
            role="status"
            aria-live="polite"
          >
            {loading && <span>Opening secure checkout…</span>}
            {!loading && verifying && <span>Verifying payment status…</span>}
            {!loading && !verifying && statusMsg && <span>{statusMsg}</span>}
            {!loading && !verifying && errorMsg && <span className="text-red-600">{errorMsg}</span>}
          </div>
        )}

        {fallbackActive && authUrl && (
          <div className="mt-4 space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Your browser blocked the inline popup. We opened Paystack in a new tab. Finish payment
              there and come back — we’ll detect it automatically.
            </div>
            <a
              href={authUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md font-semibold min-h-10 px-3 py-2 text-sm bg-brand text-white hover:bg-brand-dark/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-dark"
            >
              Open checkout again
            </a>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => reference && beginPolling(reference)}
                isLoading={false}
              >
                Re-check payment
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaystackPaymentModal;
