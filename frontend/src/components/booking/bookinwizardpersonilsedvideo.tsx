"use client";

import React, { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { useRouter } from "next/navigation";
import {
  XMarkIcon,
  BoltIcon,
  CheckBadgeIcon,
  PrinterIcon,
  CreditCardIcon,
  ChatBubbleBottomCenterTextIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { Button, TextInput, TextArea, Spinner, Toast } from "@/components/ui";
import api from "@/lib/api";

// --- Configuration & Types ---

const PAYSTACK_CURRENCY = process.env.NEXT_PUBLIC_PAYSTACK_CURRENCY || 'ZAR';
const USE_PAYSTACK = process.env.NEXT_PUBLIC_USE_PAYSTACK === '1';
const PAYSTACK_PK = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || process.env.NEXT_PUBLIC_PAYSTACK_PK;

export interface VideoOrderDraftPayload {
  artist_id: number;
  delivery_by_utc: string;
  length_sec: number;
  language: string;
  tone: string;
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
  status: 'draft' | 'awaiting_payment' | 'paid' | 'info_pending' | 'in_production' | 'delivered' | 'closed';
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
}

type LengthChoice = "30_45" | "60_90";

const LANGS = [
  { v: "EN", l: "English" },
  { v: "AF", l: "Afrikaans" },
  { v: "Bilingual", l: "Bilingual" },
] as const;

const TONES = [
  "Cheerful", "Heartfelt", "Funny", "Sincere", "Formal", "Casual", "Inspirational", "Romantic",
];

// --- Utilities ---

function formatCurrency(val: number, currency = "ZAR", locale = "en-ZA") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(val);
}

function toIsoDateUtc(day: string): string {
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

// ============================================================================
// LOGIC LAYER (Hooks)
// Copy these hooks to React Native, replace router/localStorage with RN equivalents
// ============================================================================

/**
 * Logic for Step 1: Configuration, Pricing & Draft Creation
 */
function useVideoBookingLogic({ 
  artistId, 
  basePriceZar, 
  addOnLongZar, 
  serviceId,
  onSuccess 
}: { 
  artistId: number; 
  basePriceZar: number; 
  addOnLongZar: number; 
  serviceId?: number;
  onSuccess: (orderId: number, isDemo: boolean) => void; 
}) {
  // Form State
  const [deliveryBy, setDeliveryBy] = useState<string>("");
  const [lengthChoice, setLengthChoice] = useState<LengthChoice>("30_45");
  const [language, setLanguage] = useState<string>("EN");
  const [tone, setTone] = useState<string>("Cheerful");
  const [recipient, setRecipient] = useState<string>("");
  const [contactEmail, setContactEmail] = useState<string>("");
  const [contactWhatsapp, setContactWhatsapp] = useState<string>("");
  const [promo, setPromo] = useState<string>("");

  // Async State
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [creating, setCreating] = useState(false);

  // Derived Logic
  const lengthSec = useMemo(() => (lengthChoice === "30_45" ? 40 : 75), [lengthChoice]);
  const priceAddOn = useMemo(() => (lengthChoice === "60_90" ? addOnLongZar : 0), [lengthChoice, addOnLongZar]);
  
  const deliveryDate = useMemo(() => (deliveryBy ? new Date(`${deliveryBy}T00:00:00`) : null), [deliveryBy]);
  const rushFee = useMemo(() => (deliveryDate ? computeRushFee(basePriceZar, deliveryDate) : 0), [deliveryDate, basePriceZar]);
  
  const discount = useMemo(() => (promo.trim().toUpperCase() === "SAVE10" ? Math.round((basePriceZar + priceAddOn + rushFee) * 0.1) : 0), [promo, basePriceZar, priceAddOn, rushFee]);
  const total = useMemo(() => Math.max(0, basePriceZar + priceAddOn + rushFee - discount), [basePriceZar, priceAddOn, rushFee, discount]);
  
  const canContinue = !!deliveryBy && !!contactEmail && total > 0 && available !== false && !creating;

  // Availability Check
  useEffect(() => {
    let cancel = false;
    if (!deliveryBy) { setAvailable(null); return; }

    const check = async () => {
      setChecking(true);
      let ok: boolean | null = null;
      
      // Attempt 1: New Endpoint
      try {
        const res = await safeGet<{ unavailable_dates: string[] }>(`/api/v1/service-provider-profiles/${artistId}/availability`, { when: deliveryBy });
        if (res && Array.isArray(res.unavailable_dates)) ok = !res.unavailable_dates.includes(deliveryBy);
      } catch {}

      // Attempt 2: Legacy Endpoint
      if (ok == null) {
        const legacy = await safeGet<{ capacity_ok: boolean; blackout?: boolean }>(`/api/v1/artists/${artistId}/availability`, { by: deliveryBy });
        if (legacy) ok = Boolean(legacy.capacity_ok) && !legacy.blackout;
      }

      if (!cancel) {
        setAvailable(ok == null ? true : ok); // Default to available if API fails
        setChecking(false);
      }
    };
    check();
    return () => { cancel = true; };
  }, [artistId, deliveryBy]);

  const createDraft = async () => {
    if (!canContinue) return;
    setCreating(true);

    const payload: VideoOrderDraftPayload = {
      artist_id: artistId,
      delivery_by_utc: toIsoDateUtc(deliveryBy),
      length_sec: lengthSec,
      language, tone, recipient_name: recipient || undefined,
      contact_email: contactEmail || undefined,
      contact_whatsapp: contactWhatsapp || undefined,
      promo_code: promo || undefined,
      price_base: basePriceZar, price_rush: rushFee, price_addons: priceAddOn,
      discount, total,
    };

    const idempotency = `vo-${artistId}-${deliveryBy}-${lengthSec}-${total}`;
    const res = await safePost<VideoOrder>("/api/v1/video-orders", payload, { "Idempotency-Key": idempotency });

    // Handle Local/Demo Fallback
    if (!res) {
      const fakeId = Date.now();
      try {
        localStorage.setItem(`vo-sim-${fakeId}`, JSON.stringify({ ...payload, id: fakeId, status: "awaiting_payment" }));
        localStorage.setItem(`vo-brief-seed-${fakeId}`, JSON.stringify({
          delivery_by_utc: payload.delivery_by_utc,
          length_label: lengthChoice === "30_45" ? "30–45s" : "60–90s",
          contact_email: contactEmail, contact_whatsapp: contactWhatsapp,
          language, tone, recipient_name: recipient,
        }));
      } catch {}
      setCreating(false);
      onSuccess(fakeId, true);
      return;
    }

    // Handle Success
    try {
      localStorage.setItem(`vo-brief-seed-${res.id}`, JSON.stringify({
        delivery_by_utc: payload.delivery_by_utc,
        length_label: lengthChoice === "30_45" ? "30–45s" : "60–90s",
        contact_email: contactEmail, contact_whatsapp: contactWhatsapp,
        language, tone, recipient_name: recipient,
      }));
    } catch {}

    // Optional: Create Thread
    if (serviceId) {
      const thread = await safePost<{ id: number }>(`/api/v1/booking-requests/`, { artist_id: artistId, service_id: serviceId }, { 'Idempotency-Key': `vo-thread-${artistId}-${serviceId}` });
      if (thread?.id) {
        try { localStorage.setItem(`vo-thread-${res.id}`, String(thread.id)); } catch {}
      }
    }

    setCreating(false);
    onSuccess(res.id, false);
  };

  return {
    form: { deliveryBy, setDeliveryBy, lengthChoice, setLengthChoice, language, setLanguage, tone, setTone, recipient, setRecipient, contactEmail, setContactEmail, contactWhatsapp, setContactWhatsapp, promo, setPromo },
    pricing: { basePriceZar, rushFee, priceAddOn, discount, total, lengthSec },
    status: { checking, available, creating, canContinue },
    actions: { createDraft }
  };
}

/**
 * Logic for Step 2: Payment Processing
 */
function usePaymentLogic(orderId: number) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<VideoOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const handleSuccess = async (ref?: string) => {
    await safePost(`/api/v1/video-orders/${orderId}/status`, { status: 'paid' });
    try {
      const tid = localStorage.getItem(`vo-thread-${orderId}`);
      if (tid) {
        await safePost(`/api/v1/booking-requests/${tid}/messages`, {
          message_type: 'SYSTEM',
          content: ref ? `Payment received — order #${ref}` : `Payment received — order #${orderId}`,
        });
      }
      localStorage.removeItem(`vo-sim-${orderId}`); 
    } catch {}
    Toast.success('Payment received!');
    router.push(`/video-orders/${orderId}/brief`);
  };

  const payWithPaystack = async () => {
    if (!summary || !USE_PAYSTACK || !PAYSTACK_PK) return;
    
    // Load script
    if (typeof window !== 'undefined' && !(window as any).PaystackPop) {
        await new Promise<void>((resolve) => {
            const s = document.createElement('script');
            s.src = 'https://js.paystack.co/v1/inline.js';
            s.async = true;
            s.onload = () => resolve();
            document.body.appendChild(s);
        });
    }

    const handler = (window as any).PaystackPop.setup({
      key: PAYSTACK_PK,
      email: summary.contact_email || `pv-buyer-${orderId}@example.com`,
      amount: Math.round(Math.max(0, Number(summary.total || 0)) * 100),
      currency: PAYSTACK_CURRENCY,
      metadata: { order_id: orderId, purpose: 'personalized_video' },
      callback: (res: { reference: string }) => handleSuccess(res?.reference),
    });
    handler.openIframe();
  };

  const payWithDemo = async () => {
    await handleSuccess();
  };

  return { loading, summary, error, payWithPaystack, payWithDemo };
}

/**
 * Logic for Step 3: Brief/Q&A
 */
function useBriefLogic(orderId: number, threadId?: number) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  
  // Questions Configuration
  const questions = useMemo(() => [
    { key: "recipient_name", label: "Who is the video for?", type: "text" },
    { key: "pronunciation", label: "Pronunciation (optional)", type: "text" },
    { key: "occasion", label: "Occasion", type: "chips", options: ["Birthday", "Anniversary", "Roast", "Pep Talk", "Just Because"] },
    { key: "script_points", label: "What should I say? (3–5 bullets)", type: "text" },
    { key: "inside_jokes", label: "Inside jokes / special details", type: "text" },
    { key: "avoid", label: "Anything to avoid", type: "text" },
    { key: "tone", label: "Tone & style", type: "chips", options: TONES },
    { key: "language", label: "Language", type: "chips", options: ["English", "Afrikaans", "Bilingual"] },
    { key: "desired_length", label: "Desired length", type: "chips", options: ["Short", "Medium (30-45s)", "Long (60s+)"] },
    { key: "delivery_contact", label: "Delivery email / WhatsApp", type: "text" },
    { key: "reference_assets", label: "Optional photo/reference links", type: "text" },
  ], []);

  // Calculate Progress
  const progress = useMemo(() => {
    const answeredCount = Object.values(answers).filter(v => typeof v === 'string' ? v.trim().length > 0 : v != null).length;
    return { answered: answeredCount, total: questions.length };
  }, [answers, questions]);

  // Load Seed & Answers
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // 1. Load saved answers
    try {
      const saved = localStorage.getItem(`vo-ans-${orderId}`);
      if (saved) setAnswers(JSON.parse(saved));
    } catch {}

    // 2. Merge Seed Data if answers are empty
    try {
      const rawSeed = localStorage.getItem(`vo-brief-seed-${orderId}`);
      if (rawSeed) {
        const seed = JSON.parse(rawSeed);
        setAnswers(prev => {
            const next = { ...prev };
            if (!next.recipient_name && seed.recipient_name) next.recipient_name = seed.recipient_name;
            if (!next.delivery_contact) next.delivery_contact = seed.contact_email || seed.contact_whatsapp;
            if (!next.desired_length) next.desired_length = seed.length_label;
            if (!next.tone) next.tone = seed.tone;
            return next;
        });
      }
    } catch {}
  }, [orderId]);

  const saveAnswer = async (key: string, value: any) => {
    setSaving(true);
    const next = { ...answers, [key]: value };
    setAnswers(next);
    try { localStorage.setItem(`vo-ans-${orderId}`, JSON.stringify(next)); } catch {}
    
    // Debounced network request could go here, for now strictly safePost
    await safePost(`/api/v1/video-orders/${orderId}/answers`, { question_key: key, value });
    setSaving(false);
  };

  const submitBrief = async () => {
    await safePost(`/api/v1/video-orders/${orderId}/status`, { status: "in_production" });
    try {
      const tid = threadId || localStorage.getItem(`vo-thread-${orderId}`);
      if (tid) {
        const url = typeof window !== 'undefined' ? `${window.location.origin}/video-orders/${orderId}/brief` : '';
        await safePost(`/api/v1/booking-requests/${tid}/messages`, {
            message_type: 'SYSTEM',
            content: `Brief complete. Ready to start production. [View Brief](${url})`,
        });
        localStorage.setItem(`vo-brief-complete-${orderId}`, '1');
        router.push(`/inbox?requestId=${tid}`);
        return;
      }
    } catch {}
    router.push('/inbox');
  };

  return { answers, progress, saving, questions, saveAnswer, submitBrief };
}

// ============================================================================
// PRESENTATION LAYER (Components)
// ============================================================================

interface WizardProps {
  artistId: number;
  isOpen: boolean;
  onClose: () => void;
  basePriceZar?: number;
  addOnLongZar?: number;
  serviceId?: number;
}

export default function BookinWizardPersonilsedVideo({
  artistId,
  isOpen,
  onClose,
  basePriceZar = 850,
  addOnLongZar = 250,
  serviceId,
}: WizardProps) {
  const router = useRouter();
  
  const { form, pricing, status, actions } = useVideoBookingLogic({
    artistId,
    basePriceZar,
    addOnLongZar,
    serviceId,
    onSuccess: (orderId, isDemo) => {
        if (USE_PAYSTACK && !isDemo) {
            // In a real app we might open the paystack modal here directly, 
            // but for this flow we route to the payment page.
            router.push(`/video-orders/${orderId}/pay`);
        } else {
            router.push(`/video-orders/${orderId}/pay?sim=1`);
        }
    }
  });

  // Calculate minimum date for date picker
  const minDate = new Date(Date.now() + 24 * 3600000).toISOString().slice(0, 10);

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
          <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        </Transition.Child>

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
            <Dialog.Panel className="w-full md:max-w-2xl bg-white rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
                <div>
                    <Dialog.Title className="text-lg font-semibold text-gray-900">Book a Video</Dialog.Title>
                    <p className="text-xs text-gray-500">Personalize your request</p>
                </div>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-5 py-6">
                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                    
                  {/* Left Column: Preferences */}
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Delivery Date</label>
                      <input
                        type="date"
                        min={minDate}
                        className="w-full rounded-xl border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-black focus:ring-black transition-all"
                        value={form.deliveryBy}
                        onChange={(e) => form.setDeliveryBy(e.target.value)}
                      />
                      <div className="mt-2 h-5 text-xs">
                        {status.checking ? (
                          <span className="flex items-center gap-1 text-gray-500"><Spinner size="sm" /> Checking availability...</span>
                        ) : status.available === true ? (
                          <span className="flex items-center gap-1 text-emerald-600 font-medium"><CheckBadgeIcon className="h-4 w-4" /> Available</span>
                        ) : status.available === false ? (
                          <span className="flex items-center gap-1 text-red-500 font-medium"><BoltIcon className="h-4 w-4" /> Unavailable</span>
                        ) : (
                           <span className="text-gray-400">Rush fees apply under 48h</span> 
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Video Length</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { v: "30_45" as LengthChoice, l: "30–45s", desc: "Standard" },
                          { v: "60_90" as LengthChoice, l: "60–90s", desc: `+ ${formatCurrency(addOnLongZar)}` },
                        ].map((o) => (
                          <button
                            key={o.v}
                            onClick={() => form.setLengthChoice(o.v)}
                            className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                              form.lengthChoice === o.v 
                                ? "border-black bg-black text-white shadow-md" 
                                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600"
                            }`}
                          >
                            <div className="text-sm font-semibold">{o.l}</div>
                            <div className={`text-[10px] ${form.lengthChoice === o.v ? 'text-gray-300' : 'text-gray-400'}`}>{o.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Tone</label>
                      <div className="flex flex-wrap gap-2">
                        {TONES.slice(0, 6).map((t) => (
                          <button
                            key={t}
                            onClick={() => form.setTone(t)}
                            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                              form.tone === t 
                                ? "border-black bg-black text-white" 
                                : "border-gray-200 text-gray-600 hover:border-gray-300"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Details */}
                  <div className="space-y-4">
                    <TextInput 
                        label="Recipient (Optional)" 
                        value={form.recipient} 
                        onChange={(e: any) => form.setRecipient(e.target.value)} 
                        placeholder="e.g. My Mom, Sarah"
                    />
                    <TextInput
                      label="Your Email"
                      type="email"
                      value={form.contactEmail}
                      onChange={(e: any) => form.setContactEmail(e.target.value)}
                      placeholder="Where should we send the video?"
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <TextInput
                        label="WhatsApp (Optional)"
                        value={form.contactWhatsapp}
                        onChange={(e: any) => form.setContactWhatsapp(e.target.value)}
                        placeholder="+27..."
                        />
                         <TextInput
                        label="Promo Code"
                        value={form.promo}
                        onChange={(e: any) => form.setPromo(e.target.value)}
                        placeholder="SAVE10"
                        />
                    </div>
                    
                    <div className="rounded-xl bg-blue-50/50 border border-blue-100 p-3 text-xs text-blue-800 flex gap-2 items-start">
                        <ShieldCheckIcon className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>You won't be charged until you review the total and confirm payment on the next screen.</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer / Summary */}
              <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-2 text-sm text-gray-600">
                        <span>Total Estimate:</span>
                        <span className="text-xl font-bold text-gray-900">{formatCurrency(pricing.total)}</span>
                        {pricing.discount > 0 && <span className="text-xs text-green-600 font-medium">({formatCurrency(pricing.discount)} off)</span>}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                        Base: {formatCurrency(pricing.basePriceZar)} 
                        {pricing.rushFee > 0 && ` • Rush: ${formatCurrency(pricing.rushFee)}`}
                        {pricing.priceAddOn > 0 && ` • Extras: ${formatCurrency(pricing.priceAddOn)}`}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <button 
                        onClick={onClose} 
                        className="hidden md:block px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
                    >
                        Cancel
                    </button>
                    <Button
                      onClick={actions.createDraft}
                      disabled={!status.canContinue}
                      className="w-full md:w-auto"
                    >
                      {status.creating ? "Creating Order..." : "Continue to Payment"}
                    </Button>
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

// ============================================================================
// PAGE 2: PAYMENT
// ============================================================================

export function VideoPaymentPage({ orderId }: { orderId: number }) {
  const { loading, summary, error, payWithPaystack, payWithDemo } = usePaymentLogic(orderId);

  if (loading) return <div className="flex h-64 items-center justify-center"><Spinner /></div>;
  if (error || !summary) return <div className="p-8 text-center text-red-600">Unable to load order.</div>;

  return (
    <div className="mx-auto max-w-md p-6 mt-10">
      <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-xl shadow-gray-200/50">
        <div className="mb-6 flex justify-center">
            <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                <CreditCardIcon className="h-6 w-6" />
            </div>
        </div>
        
        <h1 className="text-center text-xl font-bold text-gray-900">Complete your Booking</h1>
        <p className="mt-2 text-center text-sm text-gray-500">Order #{orderId} • Secure Payment</p>

        <div className="my-8 space-y-3 rounded-xl bg-gray-50 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Delivery By</span>
            <span className="font-medium text-gray-900">{new Date(summary.delivery_by_utc).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Length</span>
            <span className="font-medium text-gray-900">~{summary.length_sec}s</span>
          </div>
          <div className="border-t border-gray-200 pt-3 flex justify-between text-base">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="font-bold text-gray-900">{formatCurrency(summary.total)}</span>
          </div>
        </div>

        {USE_PAYSTACK && PAYSTACK_PK ? (
          <Button onClick={payWithPaystack} className="w-full h-11 text-base">
            Pay {formatCurrency(summary.total)}
          </Button>
        ) : (
          <Button onClick={payWithDemo} variant="secondary" className="w-full">
            Simulate Payment (Demo)
          </Button>
        )}
        
        <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <ShieldCheckIcon className="h-3 w-3" />
            <span>Payments processed securely.</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PAGE 3: BRIEF
// ============================================================================

export function VideoChatBrief({ orderId, threadId }: { orderId: number; threadId?: number }) {
  const { answers, progress, saving, questions, saveAnswer, submitBrief } = useBriefLogic(orderId, threadId);

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-100 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Video Brief</h1>
          <p className="mt-1 text-sm text-gray-500">
            Order #{orderId} • <span className="text-emerald-600 font-medium">{progress.answered}/{progress.total} Completed</span>
            {saving && <span className="ml-2 animate-pulse text-gray-400">Saving...</span>}
          </p>
        </div>
        <button 
            onClick={() => typeof window !== 'undefined' && window.print()}
            className="no-print inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
            <PrinterIcon className="h-4 w-4" /> Print Brief
        </button>
      </div>

      {/* Questions */}
      <div className="space-y-6">
        {questions.map((q) => (
          <div key={q.key} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
            <label className="mb-3 block text-sm font-semibold text-gray-900">{q.label}</label>
            
            {q.type === "text" ? (
              <TextArea 
                rows={3} 
                className="w-full resize-none rounded-lg border-gray-200 text-sm focus:border-black focus:ring-black"
                placeholder="Type here..."
                value={answers[q.key] || ""} 
                onChange={(e: any) => saveAnswer(q.key, e.target.value)} 
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {q.options?.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => saveAnswer(q.key, opt)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${
                      answers[q.key] === opt 
                        ? "border-black bg-black text-white shadow-sm" 
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer Action */}
      <div className="no-print sticky bottom-4 z-10 mx-auto max-w-xl">
        <div className="rounded-2xl border border-gray-200 bg-white/90 p-2 shadow-xl backdrop-blur-md flex gap-2">
            <div className="flex-1 flex items-center px-4 text-xs text-gray-500">
                Your answers auto-save as you type.
            </div>
            <Button onClick={submitBrief} className="shrink-0 shadow-lg">
                <ChatBubbleBottomCenterTextIcon className="h-4 w-4 mr-2" />
                Mark as Complete
            </Button>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; }
          textarea, input { border: none !important; resize: none; padding: 0; }
        }
      `}</style>
    </div>
  );
}