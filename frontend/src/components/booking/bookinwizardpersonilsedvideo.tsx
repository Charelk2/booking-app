"use client";

import React, { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { useRouter } from "next/navigation";
import {
  XMarkIcon,
  BoltIcon,
  ClockIcon,
  CheckBadgeIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { Button, TextInput, TextArea, Spinner, Toast } from "@/components/ui";
import api from "@/lib/api";

// Personalized Video Booking Wizard
// Step 1: Basics & Delivery (sheet) → creates draft order and routes to payment page
// Step 2: Payment (full page, 3DS safe) — exported helper component
// Step 3: Inline Chat Brief (autosave) — exported helper component

export interface VideoOrderDraftPayload {
  artist_id: number;
  delivery_by_utc: string; // ISO date YYYY-MM-DDT00:00:00Z
  length_sec: number; // derived from selection (avg or min of range)
  language: string; // 'EN'|'AF'|'Bilingual'
  tone: string; // cheerful, heartfelt, funny, formal
  recipient_name?: string;
  contact_email?: string;
  contact_whatsapp?: string;
  promo_code?: string;
  price_base: number;
  price_rush: number;
  price_addons: number;
  discount: number;
  total: number;
}

export interface VideoOrder {
  id: number;
  artist_id: number;
  buyer_id: number;
  status:
    | "draft"
    | "awaiting_payment"
    | "paid"
    | "info_pending"
    | "in_production"
    | "delivered"
    | "closed";
  delivery_by_utc: string;
  length_sec: number;
  language: string;
  tone: string;
  price_base: number;
  price_rush: number;
  price_addons: number;
  discount: number;
  total: number;
  contact_email?: string;
  contact_whatsapp?: string;
  thread_id?: number;
  payment_intent_id?: string;
}

type LengthChoice = "30_45" | "60_90";

interface Props {
  artistId: number;
  isOpen: boolean;
  onClose: () => void;
  // Optional override defaults
  basePriceZar?: number; // default base
  addOnLongZar?: number; // surcharge for 60–90s
  serviceId?: number; // create a related booking request thread
}

const LANGS = [
  { v: "EN", l: "English" },
  { v: "AF", l: "Afrikaans" },
  { v: "Bilingual", l: "Bilingual" },
] as const;

const TONES = [
  "Cheerful",
  "Heartfelt",
  "Funny",
  "Sincere",
  "Formal",
  "Casual",
  "Inspirational",
  "Romantic",
];

function formatCurrency(val: number, currency = "ZAR", locale = "en-ZA") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(val);
}

function toIsoDateUtc(day: string): string {
  // day: YYYY-MM-DD → set 00:00:00Z
  const [y, m, d] = day.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0));
  return dt.toISOString();
}

async function safeGet<T>(url: string, params?: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await api.get<T>(url, { params });
    return res.data as T;
  } catch (e) {
    return null;
  }
}

async function safePost<T>(url: string, data?: unknown, headers?: Record<string, string>): Promise<T | null> {
  try {
    const res = await api.post<T>(url, data, { headers });
    return res.data as T;
  } catch (e) {
    return null;
  }
}

function computeRushFee(base: number, deliveryBy: Date): number {
  const now = new Date();
  const hours = Math.max(0, (deliveryBy.getTime() - now.getTime()) / 3600000);
  if (hours <= 24) return Math.round(base * 0.75);
  if (hours <= 48) return Math.round(base * 0.4);
  return 0;
}

export default function BookinWizardPersonilsedVideo({
  artistId,
  isOpen,
  onClose,
  basePriceZar = 850,
  addOnLongZar = 250,
  serviceId,
}: Props) {
  const router = useRouter();
  const USE_PAYSTACK = process.env.NEXT_PUBLIC_USE_PAYSTACK === '1';
  const PAYSTACK_PK = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || process.env.NEXT_PUBLIC_PAYSTACK_PK;
  const PAYSTACK_CURRENCY = process.env.NEXT_PUBLIC_PAYSTACK_CURRENCY || 'ZAR';
  const [deliveryBy, setDeliveryBy] = useState<string>(""); // YYYY-MM-DD
  const [lengthChoice, setLengthChoice] = useState<LengthChoice>("30_45");
  const [language, setLanguage] = useState<string>("EN");
  const [tone, setTone] = useState<string>("Cheerful");
  const [recipient, setRecipient] = useState<string>("");
  const [contactEmail, setContactEmail] = useState<string>("");
  const [contactWhatsapp, setContactWhatsapp] = useState<string>("");
  const [promo, setPromo] = useState<string>("");
  const [checking, setChecking] = useState<boolean>(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [creating, setCreating] = useState<boolean>(false);

  const lengthSec = useMemo(() => (lengthChoice === "30_45" ? 40 : 75), [lengthChoice]);
  const priceAddOn = useMemo(() => (lengthChoice === "60_90" ? addOnLongZar : 0), [lengthChoice, addOnLongZar]);
  const deliveryDate = useMemo(() => (deliveryBy ? new Date(`${deliveryBy}T00:00:00`) : null), [deliveryBy]);
  const rushFee = useMemo(
    () => (deliveryDate ? computeRushFee(basePriceZar, deliveryDate) : 0),
    [deliveryDate, basePriceZar],
  );
  const discount = useMemo(() => (promo.trim().toUpperCase() === "SAVE10" ? Math.round((basePriceZar + priceAddOn + rushFee) * 0.1) : 0), [promo, basePriceZar, priceAddOn, rushFee]);
  const total = useMemo(() => Math.max(0, basePriceZar + priceAddOn + rushFee - discount), [basePriceZar, priceAddOn, rushFee, discount]);

  // Availability ping (capacity + blackout) — permissive if API missing
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!deliveryBy) {
        setAvailable(null);
        return;
      }
      setChecking(true);
      const data = await safeGet<{ capacity_ok: boolean; blackout?: boolean }>(
        `/api/v1/artists/${artistId}/availability`,
        { by: deliveryBy },
      );
      if (cancel) return;
      if (!data) {
        setAvailable(true); // assume ok if API unavailable
      } else {
        setAvailable(Boolean(data.capacity_ok) && !data.blackout);
      }
      setChecking(false);
    })();
    return () => {
      cancel = true;
    };
  }, [artistId, deliveryBy]);

  const canContinue = !!deliveryBy && !!contactEmail && total > 0 && available !== false && !creating;

  // Load Paystack inline script once
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

  const openPaystackForOrder = async (orderId: number, amountZar: number, email?: string) => {
    if (!USE_PAYSTACK || !PAYSTACK_PK) return;
    await loadPaystack();
    const PaystackPop = (window as any).PaystackPop;
    const handler = PaystackPop.setup({
      key: PAYSTACK_PK,
      email: email || `pv-buyer-${orderId}@example.com`,
      amount: Math.round(Math.max(0, Number(amountZar || 0)) * 100),
      currency: PAYSTACK_CURRENCY,
      metadata: { order_id: orderId, purpose: 'personalized_video' },
      callback: function (response: { reference: string; status?: string }) {
        (async () => {
          const ref = response?.reference;
          await safePost(`/api/v1/video-orders/${orderId}/status`, { status: 'paid' });
          try {
            const tid = localStorage.getItem(`vo-thread-${orderId}`);
            if (tid) {
              const receiptHint = ref ? ' · View receipt' : '';
              await safePost(`/api/v1/booking-requests/${tid}/messages`, {
                message_type: 'SYSTEM',
                content: ref ? `Payment received — order #${ref}${receiptHint}` : `Payment received — order #${orderId}`,
              });
            }
          } catch {}
          try { localStorage.removeItem(`vo-sim-${orderId}`); } catch {}
          Toast.success('Payment received. Thank you!');
          router.push(`/video-orders/${orderId}/brief`);
        })();
      },
      onClose: function () {
        Toast.info('Payment window closed');
      },
    });
    handler.openIframe();
  };

  const createDraftAndGoToPayment = async () => {
    if (!deliveryBy) return;
    const payload: VideoOrderDraftPayload = {
      artist_id: artistId,
      delivery_by_utc: toIsoDateUtc(deliveryBy),
      length_sec: lengthSec,
      language,
      tone,
      recipient_name: recipient || undefined,
      contact_email: contactEmail || undefined,
      contact_whatsapp: contactWhatsapp || undefined,
      promo_code: promo || undefined,
      price_base: basePriceZar,
      price_rush: rushFee,
      price_addons: priceAddOn,
      discount,
      total,
    };
    const idempotency = `vo-${artistId}-${deliveryBy}-${lengthSec}-${total}`;
    setCreating(true);
    const res = await safePost<VideoOrder>("/api/v1/video-orders", payload, {
      "Idempotency-Key": idempotency,
    });
    setCreating(false);
    if (!res) {
      // Fallback: simulate an order locally and route to demo payment page
      const fakeId = Date.now();
      const fakeOrder: VideoOrder = {
        id: fakeId,
        artist_id: artistId,
        buyer_id: 0,
        status: "awaiting_payment",
        delivery_by_utc: toIsoDateUtc(deliveryBy),
        length_sec: lengthSec,
        language,
        tone,
        price_base: basePriceZar,
        price_rush: rushFee,
        price_addons: priceAddOn,
        discount,
        total,
      } as VideoOrder;
      try {
        localStorage.setItem(`vo-sim-${fakeId}`, JSON.stringify(fakeOrder));
        // Seed brief defaults for Step 3
        const seed = {
          delivery_by_utc: fakeOrder.delivery_by_utc,
          length_label: lengthChoice === "30_45" ? "30–45s" : "60–90s",
          contact_email: contactEmail,
          contact_whatsapp: contactWhatsapp,
          language,
          tone,
          recipient_name: recipient,
        };
        localStorage.setItem(`vo-brief-seed-${fakeId}`, JSON.stringify(seed));
      } catch {}
      // Best-effort: create a message thread (booking request) so chat exists early
      if (serviceId) {
        const thread = await safePost<{ id: number }>(`/api/v1/booking-requests/`, {
          artist_id: artistId,
          service_id: serviceId,
          service_provider_id: 0,
        }, { 'Idempotency-Key': `vo-thread-${artistId}-${serviceId}-${deliveryBy}-${lengthSec}` });
        if (thread?.id) {
          try {
            localStorage.setItem(`vo-thread-${fakeId}`, String(thread.id));
            localStorage.setItem(`vo-order-for-thread-${thread.id}`, String(fakeId));
          } catch {}
          // No initial system message per request
        }
      }
      if (USE_PAYSTACK && PAYSTACK_PK) {
        Toast.success("Opening Paystack…");
        openPaystackForOrder(fakeId, total, contactEmail || undefined);
        return;
      }
      Toast.success("Demo order created — continue to payment");
      router.push(`/video-orders/${fakeId}/pay?sim=1`);
      return;
    }
    if (USE_PAYSTACK && PAYSTACK_PK) {
      Toast.success("Opening Paystack…");
      openPaystackForOrder(res.id, total, contactEmail || undefined);
      return;
    }
    Toast.success("Order created — continue to payment");
    // Save brief seed for Step 3
    try {
      const seed = {
        delivery_by_utc: payload.delivery_by_utc,
        length_label: lengthChoice === "30_45" ? "30–45s" : "60–90s",
        contact_email: contactEmail,
        contact_whatsapp: contactWhatsapp,
        language,
        tone,
        recipient_name: recipient,
      };
      localStorage.setItem(`vo-brief-seed-${res.id}`, JSON.stringify(seed));
    } catch {}
    // Best-effort create thread and initial system message
    if (serviceId) {
      const thread = await safePost<{ id: number }>(`/api/v1/booking-requests/`, {
        artist_id: artistId,
        service_id: serviceId,
        service_provider_id: 0,
      }, { 'Idempotency-Key': `vo-thread-${artistId}-${serviceId}-${deliveryBy}-${lengthSec}` });
      if (thread?.id) {
        try {
          localStorage.setItem(`vo-thread-${res.id}`, String(thread.id));
          localStorage.setItem(`vo-order-for-thread-${thread.id}`, String(res.id));
        } catch {}
        // No initial system message per request
      }
    }
    router.push(`/video-orders/${res.id}/pay`);
  };

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Overlay */}
        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
          <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        </Transition.Child>

        {/* Sheet content */}
        <div className="fixed inset-x-0 bottom-0 md:inset-0 flex items-end md:items-center justify-center p-0 md:p-6">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 translate-y-6 md:scale-95"
            enterTo="opacity-100 translate-y-0 md:scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 translate-y-0 md:scale-100"
            leaveTo="opacity-0 translate-y-6 md:scale-95"
          >
            <Dialog.Panel className="w-full md:max-w-2xl bg-white rounded-t-2xl md:rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
              <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3">
                <div className="flex items-center justify-between">
                  <Dialog.Title className="text-base font-semibold text-gray-900">Basics & Delivery</Dialog.Title>
                  <button onClick={onClose} className="p-2 rounded hover:bg-gray-50" aria-label="Close">
                    <XMarkIcon className="h-5 w-5 text-gray-600" />
                  </button>
                </div>
              </div>

              <div className="px-4 py-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Delivery by</label>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-gray-900 focus:border-gray-900"
                      value={deliveryBy}
                      min={new Date(Date.now() + 24 * 3600000).toISOString().slice(0, 10)}
                      onChange={(e) => setDeliveryBy(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-gray-500">Rush pricing applies inside 24–48h.</p>
                    <div className="mt-2 text-xs">
                      {checking ? (
                        <span className="inline-flex items-center gap-1 text-gray-600"><Spinner size="sm" /> Checking availability…</span>
                      ) : available == null ? null : available ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700"><CheckBadgeIcon className="h-4 w-4" /> Looks good</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600"><BoltIcon className="h-4 w-4" /> Not available that day</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Length</label>
                    <div className="mt-1 flex gap-2">
                      {(
                        [
                          { v: "30_45" as LengthChoice, l: "30–45s", desc: "Most popular" },
                          { v: "60_90" as LengthChoice, l: "60–90s", desc: `+ ${formatCurrency(addOnLongZar)}` },
                        ]
                      ).map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setLengthChoice(o.v)}
                          className={`rounded-lg border px-3 py-1.5 text-sm ${lengthChoice === o.v ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 hover:border-gray-400"}`}
                          aria-pressed={lengthChoice === o.v}
                        >
                          <div className="font-medium">{o.l}</div>
                          <div className="text-[11px] opacity-80">{o.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Language</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {LANGS.map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setLanguage(o.v)}
                          className={`rounded-full border px-3 py-1 text-sm ${language === o.v ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 hover:border-gray-400"}`}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Tone</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {TONES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTone(t)}
                          className={`rounded-full border px-3 py-1 text-sm ${tone === t ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 hover:border-gray-400"}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <TextInput label="Recipient name (optional)" value={recipient} onChange={(e: any) => setRecipient(e.target.value)} />
                  <TextInput
                    label="Delivery email"
                    type="email"
                    value={contactEmail}
                    onChange={(e: any) => setContactEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                  <TextInput
                    label="WhatsApp (optional)"
                    value={contactWhatsapp}
                    onChange={(e: any) => setContactWhatsapp(e.target.value)}
                    placeholder="+27 …"
                  />
                  <TextInput
                    label="Promo code (optional)"
                    value={promo}
                    onChange={(e: any) => setPromo(e.target.value)}
                    placeholder="SAVE10"
                  />
                  <div className="rounded-md border border-gray-200 p-3 text-xs text-gray-600">
                    You won’t be charged until you confirm payment.
                  </div>
                </div>
              </div>

              {/* Price summary sticky bar */}
              <div className="sticky bottom-0 z-10 border-t border-gray-100 bg-white px-4 py-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="text-sm text-gray-700">
                    <div className="flex items-center gap-2">
                      <span>Base</span>
                      <span className="font-medium">{formatCurrency(basePriceZar)}</span>
                      <span aria-hidden className="text-gray-300">·</span>
                      <span>Rush</span>
                      <span className="font-medium">{formatCurrency(rushFee)}</span>
                      <span aria-hidden className="text-gray-300">·</span>
                      <span>Length</span>
                      <span className="font-medium">{formatCurrency(priceAddOn)}</span>
                      <span aria-hidden className="text-gray-300">·</span>
                      <span>Discount</span>
                      <span className="font-medium">−{formatCurrency(discount)}</span>
                      <span aria-hidden className="text-gray-300">=</span>
                      <span className="font-semibold">Total {formatCurrency(total)}</span>
                    </div>
                    {deliveryBy && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        Delivery by {new Date(`${deliveryBy}T00:00:00`).toLocaleDateString()}; length {lengthChoice === "30_45" ? "30–45s" : "60–90s"}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={createDraftAndGoToPayment}
                      disabled={!canContinue}
                      title={!deliveryBy ? "Choose a delivery date" : available === false ? "Not available on that day" : !contactEmail ? "Enter delivery email" : undefined}
                    >
                      {creating ? "Creating…" : "Continue to payment"}
                    </Button>
                    <button onClick={onClose} className="text-sm text-gray-600 hover:text-gray-800 px-3 py-2">Cancel</button>
                  </div>
                </div>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}

// Step 2 — minimalist payment page (optional export)
export function VideoPaymentPage({ orderId }: { orderId: number }) {
  const router = useRouter();
  const USE_PAYSTACK = process.env.NEXT_PUBLIC_USE_PAYSTACK === '1';
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<VideoOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const PAYSTACK_PK = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || process.env.NEXT_PUBLIC_PAYSTACK_PK;

  // Load order summary (from API or simulated local storage)
  useEffect(() => {
    (async () => {
      setLoading(true);
      let order = await safeGet<VideoOrder>(`/api/v1/video-orders/${orderId}`);
      if (!order) {
        try {
          const raw = localStorage.getItem(`vo-sim-${orderId}`);
          if (raw) order = JSON.parse(raw);
        } catch {}
      }
      setSummary(order || null);
      setLoading(false);
    })();
  }, [orderId]);

  // Dynamically load Paystack script if needed
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

  const payWithPaystack = async () => {
    if (!summary) return;
    if (!USE_PAYSTACK || !PAYSTACK_PK) {
      setError('Payment provider not configured.');
      return;
    }
    try {
      await loadPaystack();
      const PaystackPop = (window as any).PaystackPop;
      const handler = PaystackPop.setup({
        key: PAYSTACK_PK,
        email: summary.contact_email || `pv-buyer-${orderId}@example.com`,
        amount: Math.round(Math.max(0, Number(summary.total || 0)) * 100), // kobo (int)
        currency: PAYSTACK_CURRENCY,
        metadata: { order_id: orderId, purpose: 'personalized_video' },
        callback: function (response: { reference: string; status?: string }) {
          (async () => {
            const ref = response?.reference;
            await safePost(`/api/v1/video-orders/${orderId}/status`, { status: 'paid' });
            try {
              const tid = localStorage.getItem(`vo-thread-${orderId}`);
              if (tid) {
                const receiptHint = ref ? ` · View receipt` : '';
                await safePost(`/api/v1/booking-requests/${tid}/messages`, {
                  message_type: 'SYSTEM',
                  content: ref ? `Payment received — order #${ref}${receiptHint}` : `Payment received — order #${orderId}`,
                });
              }
            } catch {}
            try { localStorage.removeItem(`vo-sim-${orderId}`); } catch {}
            Toast.success('Payment received. Thank you!');
            router.push(`/video-orders/${orderId}/brief`);
          })();
        },
        onClose: function () {
          Toast.info('Payment window closed');
        },
      });
      handler.openIframe();
    } catch (e: any) {
      setError(e?.message || 'Unable to start payment');
    }
  };

  // Fallback demo handler
  const handleDemoPay = async () => {
    const ok = await safePost(`/api/v1/video-orders/${orderId}/status`, { status: 'paid' });
    if (!ok) Toast.success('Payment simulated. Proceeding…');
    try {
      const tid = localStorage.getItem(`vo-thread-${orderId}`);
      if (tid) {
        await safePost(`/api/v1/booking-requests/${tid}/messages`, {
          message_type: 'SYSTEM',
          content: `Payment received — order #${orderId}.`,
        });
      }
    } catch {}
    try { localStorage.removeItem(`vo-sim-${orderId}`); } catch {}
    router.push(`/video-orders/${orderId}/brief`);
  };

  if (loading) return <div className="p-8"><Spinner /></div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Complete Payment</h1>
      {summary && (
        <div className="rounded-md border p-3 text-sm">
          <div>Delivery by: {new Date(summary.delivery_by_utc).toLocaleDateString()}</div>
          <div>Length: ~{summary.length_sec}s</div>
          <div>Total: {formatCurrency(summary.total)}</div>
        </div>
      )}
      <div className="rounded-md border p-3 text-sm bg-gray-50">
        {USE_PAYSTACK && PAYSTACK_PK ? (
          <div>Pay securely with Paystack.</div>
        ) : (
          <div>Payment provider not configured.</div>
        )}
      </div>
      {USE_PAYSTACK && PAYSTACK_PK ? (
        <Button onClick={payWithPaystack}>Pay with Paystack</Button>
      ) : (
        <Button onClick={handleDemoPay}>Pay now</Button>
      )}
    </div>
  );
}

// Step 3 — inline chat brief (optional export)
export function VideoChatBrief({ orderId, threadId }: { orderId: number; threadId?: number }) {
  const router = useRouter();
  const USE_PAYSTACK = process.env.NEXT_PUBLIC_USE_PAYSTACK === '1';
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ answered: number; total: number }>({ answered: 0, total: 15 });
  // Initialize with empty answers to avoid SSR/CSR mismatch; load from storage after mount.
  const [answers, setAnswers] = useState<Record<string, any>>({});

  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(`vo-ans-${orderId}`) : null;
      if (raw) setAnswers(JSON.parse(raw));
    } catch {}
  }, [orderId]);

  const questions: { key: string; label: string; type: "text" | "chips" }[] = [
    { key: "recipient_name", label: "Who is the video for?", type: "text" },
    { key: "pronunciation", label: "Pronunciation (optional)", type: "text" },
    { key: "occasion", label: "Occasion", type: "chips" },
    { key: "script_points", label: "What should I say? (3–5 bullets)", type: "text" },
    { key: "inside_jokes", label: "Inside jokes / special details", type: "text" },
    { key: "avoid", label: "Anything to avoid", type: "text" },
    { key: "tone", label: "Tone & style", type: "chips" },
    { key: "language", label: "Language", type: "chips" },
    { key: "address_how", label: "How to address them", type: "chips" },
    { key: "desired_length", label: "Desired length", type: "chips" },
    { key: "deadline_confirm", label: "Deadline confirmation", type: "chips" },
    { key: "where_played", label: "Where it’ll be played", type: "chips" },
    { key: "share_permission", label: "Can we share a short clip?", type: "chips" },
    { key: "delivery_contact", label: "Delivery email / WhatsApp", type: "text" },
    { key: "reference_assets", label: "Optional photo/reference upload (paste links)", type: "text" },
  ];

  useEffect(() => {
    const a = Object.values(answers).filter((v) => (typeof v === "string" ? v.trim().length > 0 : v != null)).length;
    setProgress({ answered: a, total: questions.length });
  }, [answers]);

  // Prefill defaults from Step 1 seed (delivery date, length, contacts, language/tone, recipient)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`vo-brief-seed-${orderId}`);
      if (!raw) return;
      const seed = JSON.parse(raw) as {
        delivery_by_utc?: string;
        length_label?: string;
        contact_email?: string;
        contact_whatsapp?: string;
        language?: string;
        tone?: string;
        recipient_name?: string;
      };
      const merged: Record<string, any> = { ...answers };
      const maybeSet = (key: string, val?: any) => {
        if (!val) return;
        if (merged[key] == null || merged[key] === '') merged[key] = val;
      };
      maybeSet('recipient_name', seed.recipient_name);
      maybeSet('desired_length', seed.length_label);
      if (seed.delivery_by_utc) {
        const d = new Date(seed.delivery_by_utc).toLocaleDateString();
        maybeSet('deadline_confirm', d);
      }
      const contact = seed.contact_email || seed.contact_whatsapp;
      maybeSet('delivery_contact', contact);
      // Normalize language chip labels
      const langMap: Record<string, string> = { EN: 'English', AF: 'Afrikaans', Bilingual: 'Bilingual' };
      if (seed.language) maybeSet('language', langMap[seed.language] || seed.language);
      maybeSet('tone', seed.tone);
      setAnswers(merged);
      localStorage.setItem(`vo-ans-${orderId}`, JSON.stringify(merged));
    } catch {}
  }, [orderId]);

  const save = async (key: string, value: any) => {
    setSaving(true);
    const next = { ...answers, [key]: value };
    setAnswers(next);
    try {
      localStorage.setItem(`vo-ans-${orderId}`, JSON.stringify(next));
    } catch {}
    await safePost(`/api/v1/video-orders/${orderId}/answers`, {
      question_key: key,
      value,
    });
    setSaving(false);
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      {/* Printable summary header */}
      <section id="brief-summary" className="rounded-lg border border-gray-200 bg-white p-4 print:border-0 print:p-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Personalized Video Brief</h1>
            <p className="text-sm text-gray-600">Order #{orderId}</p>
          </div>
          <button
            type="button"
            className="no-print inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
            onClick={() => typeof window !== 'undefined' && window.print()}
          >
            Print / Save as PDF
          </button>
        </div>
        {/* Bulleted brief summary */}
        <div className="mt-3 text-sm text-gray-800">
          <ul className="list-disc pl-5 space-y-1">
            {answers.recipient_name && <li><strong>Recipient:</strong> {answers.recipient_name}</li>}
            {answers.pronunciation && <li><strong>Pronunciation:</strong> {answers.pronunciation}</li>}
            {answers.occasion && <li><strong>Occasion:</strong> {answers.occasion}</li>}
            {answers.script_points && <li><strong>What to say:</strong> {answers.script_points}</li>}
            {answers.inside_jokes && <li><strong>Inside jokes / details:</strong> {answers.inside_jokes}</li>}
            {answers.avoid && <li><strong>Avoid:</strong> {answers.avoid}</li>}
            {answers.tone && <li><strong>Tone:</strong> {answers.tone}</li>}
            {answers.language && <li><strong>Language:</strong> {answers.language}</li>}
            {answers.address_how && <li><strong>Address as:</strong> {answers.address_how}</li>}
            {answers.desired_length && <li><strong>Desired length:</strong> {answers.desired_length}</li>}
            {answers.deadline_confirm && <li><strong>Delivery by:</strong> {answers.deadline_confirm}</li>}
            {answers.where_played && <li><strong>Where it’ll be played:</strong> {answers.where_played}</li>}
            {answers.share_permission && <li><strong>Share a clip publicly:</strong> {answers.share_permission}</li>}
            {answers.delivery_contact && <li><strong>Delivery contact:</strong> {answers.delivery_contact}</li>}
            {answers.reference_assets && <li><strong>References:</strong> {answers.reference_assets}</li>}
          </ul>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Personalize your video</h2>
        <div className="text-sm text-gray-600">
          {progress.answered}/{progress.total} answered {saving && <span className="ml-1 text-gray-500">Saving…</span>}
        </div>
      </div>
      <div className="rounded-md border p-3 text-xs text-gray-600">Finish later anytime — your answers auto‑save.</div>
      <ul className="space-y-3">
        {questions.map((q) => (
          <li key={q.key} className="rounded-md border p-3">
            <div className="text-sm font-medium text-gray-800 mb-1">{q.label}</div>
            {q.type === "text" ? (
              <TextArea rows={3} value={answers[q.key] || ""} onChange={(e: any) => save(q.key, e.target.value)} />
            ) : (
              <div className="flex flex-wrap gap-2">
                {["Yes", "No", "Maybe", "Short", "Medium", "Long", "English", "Afrikaans", "Bilingual", "First name", "Mr", "Ms", "Phone", "Big screen", "Social"].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => save(q.key, opt)}
                    className={`rounded-full border px-3 py-1 text-sm ${answers[q.key] === opt ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 hover:border-gray-400"}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={async () => {
            await safePost(`/api/v1/video-orders/${orderId}/status`, { status: "in_production" });
            Toast.success("Brief submitted. We’ll notify the artist.");
            // Send a system line and redirect to inbox thread
            try {
              const tid = threadId || localStorage.getItem(`vo-thread-${orderId}`);
              if (tid) {
                const origin = typeof window !== 'undefined' ? window.location.origin : '';
                const briefUrl = `${origin}/video-orders/${orderId}/brief`;
                await safePost(`/api/v1/booking-requests/${tid}/messages`, {
                  message_type: 'SYSTEM',
                  content: `Brief complete for order #${orderId}. Ready to start production. View brief: ${briefUrl}`,
                });
                try { localStorage.setItem(`vo-brief-complete-${orderId}`, '1'); } catch {}
                router.push(`/inbox?requestId=${tid}`);
                return;
              }
            } catch {}
            router.push('/inbox');
          }}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
        >
          Mark brief complete
        </button>
        <Button onClick={() => Toast.success("Saved")}>Done</Button>
      </div>

      {/* Print styles */}
      <style jsx>{`
        @media print {
          :global(header), :global(nav), :global(footer), .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          #brief-summary { page-break-inside: avoid; margin: 0; padding: 0; border: 0; }
          #brief-summary h1 { font-size: 20pt; }
          #brief-summary p, #brief-summary li { font-size: 11pt; color: #000; }
          @page { margin: 18mm; }
        }
      `}</style>
    </div>
  );
}
