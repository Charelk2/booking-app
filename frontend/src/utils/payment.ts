// utils/payment.ts
import { apiUrl } from '@/lib/api';

export const PAYSTACK_ENABLED = process.env.NEXT_PUBLIC_USE_PAYSTACK === '1';

export const BACKOFF_STEPS = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 8000];

export const rcptKey = (bookingRequestId: number) => `receipt_url:br:${bookingRequestId}`;

export const safeSet = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore errors
  }
};

export const verifyPaystack = async (
  reference: string,
  bookingRequestId: number,
  signal?: AbortSignal
): Promise<{ ok: boolean; paymentId?: string; receiptUrl?: string }> => {
  const url = apiUrl(`/api/v1/payments/paystack/verify?reference=${encodeURIComponent(reference)}`);
  const resp = await fetch(url, { credentials: 'include', signal });

  if (!resp.ok) return { ok: false };
  const data = await resp.json();
  const paymentId = data?.payment_id || reference;
  const receiptUrl = apiUrl(`/api/v1/payments/${paymentId}/receipt`);
  safeSet(rcptKey(bookingRequestId), receiptUrl);

  return { ok: true, paymentId, receiptUrl };
};
