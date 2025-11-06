// utils/paystackClient.ts
const PAYSTACK_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || '';

/** Load Paystack inline script once. */
let loadPromise: Promise<void> | null = null;

export function loadPaystackInline(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.PaystackPop) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src*="js.paystack.co/v1/inline.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed loading Paystack script')));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://js.paystack.co/v1/inline.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed loading Paystack script'));
    document.head.appendChild(s);
  });

  return loadPromise;
}

export type OpenInlineOptions = {
  email: string;
  amountMajor: number;        // amount in major units (e.g. 5000 == NGN 5000)
  currency?: string;          // default: NGN
  reference?: string;         // from your backend
  accessCode?: string;        // prefer this when you initialized server-side
  label?: string;
  channels?: string[];        // e.g. ["card", "bank", "ussd"]
  metadata?: Record<string, any>;
  onSuccess: (ref: string) => void;
  onClose: () => void;
};

/**
 * Try to open Paystack inline checkout. Throws if script missing or key not set.
 * Amount must be provided in *major* units; it's converted to subunits internally.
 */
export async function openPaystackInline(opts: OpenInlineOptions): Promise<void> {
  if (!PAYSTACK_PUBLIC_KEY) {
    throw new Error('Missing NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY');
  }
  await loadPaystackInline();
  if (!window.PaystackPop) throw new Error('Paystack script unavailable');

  const currency = (opts.currency || 'NGN').toUpperCase();
  // Convert to the smallest unit expected by Paystack (kobo for NGN)
  const amountInSubunits = Math.round(opts.amountMajor * 100);

  // Prefer binding to an existing initialized transaction via access_code to
  // avoid duplicate reference errors. If no accessCode, use reference.
  const config: any = {
    key: PAYSTACK_PUBLIC_KEY,
    email: opts.email,
    currency,
    ...(opts.accessCode ? { access_code: opts.accessCode } : {}),
    ...(opts.accessCode ? {} : (opts.reference ? { ref: opts.reference } : {})),
    label: opts.label,
    channels: opts.channels,
    metadata: opts.metadata,
    callback: (response) => {
      // response.reference is your ref
      if (response?.reference) opts.onSuccess(response.reference);
    },
    onClose: () => {
      opts.onClose();
    },
  };

  // Only include amount if we are NOT passing an access_code (amount comes from initialization when access_code is used)
  if (!opts.accessCode) {
    config.amount = amountInSubunits;
  }

  const handler = window.PaystackPop!.setup(config);

  handler.openIframe();
}
