"use client";

import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import api, { getServiceProviderAvailability } from "@/lib/api";
import { PersonalizedVideoDatePicker } from "./PersonalizedVideoDatePicker";

// =============================================================================
// CONFIG
// =============================================================================

const PAYSTACK_CURRENCY = process.env.NEXT_PUBLIC_PAYSTACK_CURRENCY || "ZAR";
const USE_PAYSTACK = process.env.NEXT_PUBLIC_USE_PAYSTACK === "1";
const PAYSTACK_PK = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || process.env.NEXT_PUBLIC_PAYSTACK_PK;

// =============================================================================
// TYPES
// =============================================================================

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
}

type LengthChoice = "30_45" | "60_90";

type BriefQuestion =
  | {
      key: string;
      label: string;
      type: "text";
      placeholder?: string;
      helper?: string;
      rows?: number;
    }
  | {
      key: string;
      label: string;
      type: "chips";
      options: string[];
      helper?: string;
    };

// =============================================================================
// OPTIONS
// =============================================================================

const LANGS = [
  { v: "EN", l: "English" },
  { v: "AF", l: "Afrikaans" },
] as const;

const BRIEF_QUESTIONS: BriefQuestion[] = [
  {
    key: "recipient_name",
    label: "Who is the video for?",
    type: "text",
    placeholder: "e.g. Sarah, my best friend",
  },
  {
    key: "pronunciation",
    label: "Name pronunciation (optional)",
    type: "text",
    placeholder: "e.g. ‘SAH-rah’ (like ‘car’)",
  },
  {
    key: "occasion",
    label: "What’s the occasion?",
    type: "chips",
    options: ["Birthday", "Anniversary", "Pep talk", "Congratulations", "Roast", "Just because"],
  },
  {
    key: "script_points",
    label: "What should the artist say? (3–5 bullets)",
    type: "text",
    placeholder: "• Mention the promotion\n• Congratulate on graduating\n• Inside joke about the dog…",
    rows: 4,
  },
  { key: "inside_jokes", label: "Inside jokes / special details", type: "text", placeholder: "Anything that makes it feel personal?" },
  { key: "avoid", label: "Anything to avoid?", type: "text", placeholder: "Sensitive topics, names, jokes, etc." },
  {
    key: "language",
    label: "Language",
    type: "chips",
    options: ["English", "Afrikaans"],
  },
  {
    key: "desired_length",
    label: "Preferred length",
    type: "chips",
    options: ["Short", "Medium (30–45s)", "Long (60s+)"],
  },
  {
    key: "reference_assets",
    label: "Optional reference links",
    type: "text",
    placeholder: "Paste links to photos, music, or examples (Google Drive, Dropbox, etc.)",
    rows: 3,
  },
];

// =============================================================================
// UTILITIES
// =============================================================================

function formatCurrency(val: number, currency = "ZAR", locale = "en-ZA") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number.isFinite(val) ? val : 0);
}

function toIsoDateUtc(day: string): string {
  // day: YYYY-MM-DD -> 00:00:00Z
  const [y, m, d] = day.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1, 0, 0, 0));
  return dt.toISOString();
}

async function safeGet<T>(url: string, params?: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await api.get<T>(url, { params });
    return res.data as T;
  } catch {
    return null;
  }
}

async function safePost<T>(url: string, data?: unknown, headers?: Record<string, string>): Promise<T | null> {
  try {
    const res = await api.post<T>(url, data, { headers });
    return res.data as T;
  } catch {
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

function safeLocalStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

function safeLocalStorageRemove(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {}
}

// =============================================================================
// PAYSTACK LOADER (shared)
// =============================================================================

let paystackScriptPromise: Promise<void> | null = null;

async function loadPaystackScript(): Promise<void> {
  if (typeof window === "undefined") return;
  if ((window as any).PaystackPop) return;

  if (paystackScriptPromise) return paystackScriptPromise;

  paystackScriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Paystack script"));
    document.body.appendChild(s);
  });

  return paystackScriptPromise;
}

// =============================================================================
// HOOKS — Step 1 (Draft creation)
// =============================================================================

function useVideoBookingLogic({
  artistId,
  basePriceZar,
  addOnLongZar,
  serviceId,
  onSuccess,
}: {
  artistId: number;
  basePriceZar: number;
  addOnLongZar: number;
  serviceId?: number;
  onSuccess: (orderId: number, isDemo: boolean) => void;
}) {
  // Form state
  const [deliveryBy, setDeliveryBy] = useState<string>("");
  const [lengthChoice, setLengthChoice] = useState<LengthChoice>("30_45");
  const [language, setLanguage] = useState<string>("EN");
  const [tone, setTone] = useState<string>("Cheerful");
  const [recipient, setRecipient] = useState<string>("");
  const [contactEmail, setContactEmail] = useState<string>("");
  const [contactWhatsapp, setContactWhatsapp] = useState<string>("");
  const [promo, setPromo] = useState<string>("");

  // Async state
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [creating, setCreating] = useState(false);
   const [unavailableDates, setUnavailableDates] = useState<string[]>([]);

  // Derived
  const lengthSec = useMemo(() => (lengthChoice === "30_45" ? 40 : 75), [lengthChoice]);
  const priceAddOn = useMemo(() => (lengthChoice === "60_90" ? addOnLongZar : 0), [lengthChoice, addOnLongZar]);

  const deliveryDate = useMemo(() => (deliveryBy ? new Date(`${deliveryBy}T00:00:00`) : null), [deliveryBy]);
  const rushFee = useMemo(() => (deliveryDate ? computeRushFee(basePriceZar, deliveryDate) : 0), [deliveryDate, basePriceZar]);

  const discount = useMemo(() => {
    const code = promo.trim().toUpperCase();
    if (code === "SAVE10") return Math.round((basePriceZar + priceAddOn + rushFee) * 0.1);
    return 0;
  }, [promo, basePriceZar, priceAddOn, rushFee]);

  const total = useMemo(() => Math.max(0, basePriceZar + priceAddOn + rushFee - discount), [basePriceZar, priceAddOn, rushFee, discount]);

  const disabledReason = useMemo(() => {
    if (creating) return "Creating your order…";
    if (!deliveryBy) return "Choose a delivery date";
    if (available === false) return "Not available for that date";
    if (total <= 0) return "Total must be greater than 0";
    return null;
  }, [creating, deliveryBy, available, total]);

  const canContinue = disabledReason == null;

  // Load full availability calendar once (for disabled dates UX)
  useEffect(() => {
    let cancelled = false;
    const loadAvailability = async () => {
      try {
        const res = await getServiceProviderAvailability(artistId);
        if (!cancelled && res?.data && Array.isArray(res.data.unavailable_dates)) {
          setUnavailableDates(res.data.unavailable_dates);
        }
      } catch {
        // Non-fatal: we'll fall back to per-date checks
      }
    };
    void loadAvailability();
    return () => {
      cancelled = true;
    };
  }, [artistId]);

  // Availability check (per-day, with permissive default if API fails)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!deliveryBy) {
        setAvailable(null);
        setChecking(false);
        return;
      }

      setChecking(true);
      let ok: boolean | null = null;

      // Prefer preloaded calendar if we have it
      if (unavailableDates.length) {
        ok = !unavailableDates.includes(deliveryBy);
      } else {
        // Fallback: per-day checks (new endpoint)
        try {
          const res = await safeGet<{ unavailable_dates: string[] }>(
            `/api/v1/service-provider-profiles/${artistId}/availability`,
            { when: deliveryBy },
          );
          if (res && Array.isArray(res.unavailable_dates)) {
            ok = !res.unavailable_dates.includes(deliveryBy);
          }
        } catch {}

        // Legacy endpoint fallback
        if (ok == null) {
          const legacy = await safeGet<{ capacity_ok: boolean; blackout?: boolean }>(
            `/api/v1/artists/${artistId}/availability`,
            { by: deliveryBy },
          );
          if (legacy) ok = Boolean(legacy.capacity_ok) && !legacy.blackout;
        }
      }

      if (cancelled) return;
      setAvailable(ok == null ? true : ok); // permissive
      setChecking(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [artistId, deliveryBy, unavailableDates]);

  const createDraft = useCallback(async () => {
    if (!canContinue) return;

    setCreating(true);
    try {
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

      // stable idempotency (same draft params -> same order)
      const idempotency = `vo-${artistId}-${deliveryBy}-${lengthSec}-${total}`;
      const res = await safePost<VideoOrder>("/api/v1/video-orders", payload, { "Idempotency-Key": idempotency });

      // Always seed the brief so Step 3 feels instant
      const seed = {
        delivery_by_utc: payload.delivery_by_utc,
        length_label: lengthChoice === "30_45" ? "30–45s" : "60–90s",
        contact_email: contactEmail,
        contact_whatsapp: contactWhatsapp,
        language,
        tone,
        recipient_name: recipient,
      };

      if (!res) {
        // Demo/local fallback
        const fakeId = Date.now();
        safeLocalStorageSet(
          `vo-sim-${fakeId}`,
          JSON.stringify({
            id: fakeId,
            artist_id: artistId,
            buyer_id: 0,
            status: "awaiting_payment",
            delivery_by_utc: payload.delivery_by_utc,
            length_sec: payload.length_sec,
            language: payload.language,
            tone: payload.tone,
            price_base: payload.price_base,
            price_rush: payload.price_rush,
            price_addons: payload.price_addons,
            discount: payload.discount,
            total: payload.total,
            contact_email: payload.contact_email,
            contact_whatsapp: payload.contact_whatsapp,
          } satisfies VideoOrder),
        );
        safeLocalStorageSet(`vo-brief-seed-${fakeId}`, JSON.stringify(seed));

        // Best-effort thread creation (so chat exists even in demo mode)
        if (serviceId) {
          const thread = await safePost<{ id: number }>(
            `/api/v1/booking-requests/`,
            { artist_id: artistId, service_id: serviceId },
            { "Idempotency-Key": `vo-thread-${fakeId}` },
          );
          if (thread?.id) {
            safeLocalStorageSet(`vo-thread-${fakeId}`, String(thread.id));
            safeLocalStorageSet(`vo-order-for-thread-${thread.id}`, String(fakeId));
          }
        }

        Toast.success("Order created (demo). Continue to payment.");
        onSuccess(fakeId, true);
        return;
      }

      // Real order
      safeLocalStorageSet(`vo-brief-seed-${res.id}`, JSON.stringify(seed));

      // Best-effort thread
      if (serviceId) {
        const thread = await safePost<{ id: number }>(
          `/api/v1/booking-requests/`,
          { artist_id: artistId, service_id: serviceId },
          { "Idempotency-Key": `vo-thread-${res.id}` },
        );
        if (thread?.id) {
          safeLocalStorageSet(`vo-thread-${res.id}`, String(thread.id));
          safeLocalStorageSet(`vo-order-for-thread-${thread.id}`, String(res.id));
        }
      }

      Toast.success("Order created — continue to payment");
      onSuccess(res.id, false);
    } finally {
      setCreating(false);
    }
  }, [
    canContinue,
    artistId,
    basePriceZar,
    deliveryBy,
    lengthChoice,
    lengthSec,
    language,
    tone,
    recipient,
    contactEmail,
    contactWhatsapp,
    promo,
    rushFee,
    priceAddOn,
    discount,
    total,
    serviceId,
    onSuccess,
  ]);

  return {
    form: {
      deliveryBy,
      setDeliveryBy,
      lengthChoice,
      setLengthChoice,
      language,
      setLanguage,
      tone,
      setTone,
      recipient,
      setRecipient,
      contactEmail,
      setContactEmail,
      contactWhatsapp,
      setContactWhatsapp,
      promo,
      setPromo,
    },
    pricing: {
      basePriceZar,
      rushFee,
      priceAddOn,
      discount,
      total,
      lengthSec,
    },
    status: {
      checking,
      available,
      creating,
      canContinue,
      disabledReason,
    },
    unavailableDates,
    actions: {
      createDraft,
    },
  };
}

// =============================================================================
// HOOK — Step 2 (Payment)
// =============================================================================

function usePaymentLogic(orderId: number) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<VideoOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    setError(null);
    setLoading(true);

    let order = await safeGet<VideoOrder>(`/api/v1/video-orders/${orderId}`);
    if (!order) {
      const raw = safeLocalStorageGet(`vo-sim-${orderId}`);
      if (raw) {
        try {
          order = JSON.parse(raw);
        } catch {}
      }
    }

    setSummary(order || null);
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  const handleSuccess = useCallback(
    async (ref?: string) => {
      await safePost(`/api/v1/video-orders/${orderId}/status`, { status: "paid" });

      try {
        const tid = safeLocalStorageGet(`vo-thread-${orderId}`);
        if (tid) {
          await safePost(`/api/v1/booking-requests/${tid}/messages`, {
            message_type: "SYSTEM",
            content: ref ? `Payment received — reference ${ref}` : `Payment received — order #${orderId}`,
          });
        }
      } catch {}

      safeLocalStorageRemove(`vo-sim-${orderId}`);
      Toast.success("Payment received!");
      router.push(`/video-orders/${orderId}/brief`);
    },
    [orderId, router],
  );

  const payWithPaystack = useCallback(async () => {
    if (!USE_PAYSTACK || !PAYSTACK_PK) {
      Toast("Payment provider not configured.");
      return;
    }
    if (!summary) return;

    try {
      await loadPaystackScript();
      const PaystackPop = (window as any).PaystackPop;

      const handler = PaystackPop.setup({
        key: PAYSTACK_PK,
        email: summary.contact_email || `pv-buyer-${orderId}@example.com`,
        amount: Math.round(Math.max(0, Number(summary.total || 0)) * 100),
        currency: PAYSTACK_CURRENCY,
        metadata: { order_id: orderId, purpose: "personalized_video" },
        callback: (res: { reference: string }) => {
          void handleSuccess(res?.reference);
        },
        onClose: () => {
          Toast("Payment window closed");
        },
      });

      handler.openIframe();
    } catch (e: any) {
      setError(e?.message || "Unable to start payment");
    }
  }, [orderId, summary, handleSuccess]);

  const payWithDemo = useCallback(async () => {
    await handleSuccess();
  }, [handleSuccess]);

  return { loading, summary, error, reload: loadOrder, payWithPaystack, payWithDemo };
}

// =============================================================================
// HOOK — Step 3 (Brief)
// =============================================================================

function useBriefLogic(orderId: number, threadId?: number) {
  const router = useRouter();

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const pendingRef = useRef<Record<string, any>>({});
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const questions = useMemo(() => BRIEF_QUESTIONS, []);

  const progress = useMemo(() => {
    const answered = questions.filter((q) => {
      const v = answers[q.key];
      if (typeof v === "string") return v.trim().length > 0;
      return v != null;
    }).length;
    return { answered, total: questions.length };
  }, [answers, questions]);

  // Load saved answers + seed merge
  useEffect(() => {
    // 1) saved answers
    const raw = safeLocalStorageGet(`vo-ans-${orderId}`);
    let next: Record<string, any> = {};
    if (raw) {
      try {
        next = JSON.parse(raw);
      } catch {}
    }

    // 2) seed
    const seedRaw = safeLocalStorageGet(`vo-brief-seed-${orderId}`);
    if (seedRaw) {
      try {
        const seed = JSON.parse(seedRaw) as {
          length_label?: string;
          contact_email?: string;
          contact_whatsapp?: string;
          tone?: string;
          recipient_name?: string;
          language?: string;
        };

        const maybeSet = (k: string, v?: any) => {
          if (!v) return;
          if (next[k] == null || String(next[k]).trim() === "") next[k] = v;
        };

        maybeSet("recipient_name", seed.recipient_name);
        maybeSet("delivery_contact", seed.contact_email || seed.contact_whatsapp);
        maybeSet("desired_length", seed.length_label);
        maybeSet("tone", seed.tone);

        // Normalize language label for chip question
        if (seed.language) {
          const map: Record<string, string> = { EN: "English", AF: "Afrikaans", Bilingual: "Bilingual" };
          maybeSet("language", map[seed.language] || seed.language);
        }
      } catch {}
    }

    setAnswers(next);
  }, [orderId]);

  // Persist answers locally on every change
  useEffect(() => {
    safeLocalStorageSet(`vo-ans-${orderId}`, JSON.stringify(answers));
  }, [orderId, answers]);

  const flushPending = useCallback(async () => {
    if (flushingRef.current) return;
    const entries = Object.entries(pendingRef.current);
    if (entries.length === 0) return;

    flushingRef.current = true;
    pendingRef.current = {};
    if (mountedRef.current) setSaveState("saving");

    let anyFailed = false;

    for (const [key, value] of entries) {
      const ok = await safePost(`/api/v1/video-orders/${orderId}/answers`, { question_key: key, value });
      if (!ok) {
        anyFailed = true;
        pendingRef.current[key] = value; // retry later
      }
    }

    flushingRef.current = false;

    if (!mountedRef.current) return;

    if (anyFailed) {
      setSaveState("error");
    } else {
      setSaveState("saved");
      window.setTimeout(() => {
        if (mountedRef.current) setSaveState("idle");
      }, 1500);
    }
  }, [orderId]);

  // Ensure any pending saves try to flush on unmount
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      void flushPending();
    };
  }, [flushPending]);

  const saveAnswer = useCallback(
    (key: string, value: any, opts?: { immediate?: boolean }) => {
      setAnswers((prev) => ({ ...prev, [key]: value }));
      pendingRef.current[key] = value;

      const immediate = Boolean(opts?.immediate);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);

      if (immediate) {
        void flushPending();
        return;
      }

      flushTimerRef.current = setTimeout(() => {
        void flushPending();
      }, 700);
    },
    [flushPending],
  );

  const submitBrief = useCallback(async () => {
    // Best-effort flush answers before submission
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    await flushPending();

    await safePost(`/api/v1/video-orders/${orderId}/status`, { status: "in_production" });

    try {
      const tid = threadId || safeLocalStorageGet(`vo-thread-${orderId}`);
      if (tid) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const briefUrl = `${origin}/video-orders/${orderId}/brief`;

        await safePost(`/api/v1/booking-requests/${tid}/messages`, {
          message_type: "SYSTEM",
          content: `Brief complete for order #${orderId}. Ready to start production. View brief: ${briefUrl}`,
        });

        safeLocalStorageSet(`vo-brief-complete-${orderId}`, "1");
        Toast.success("Brief submitted. The artist has been notified.");
        router.push(`/inbox?requestId=${tid}`);
        return;
      }
    } catch {}

    Toast.success("Brief submitted.");
    router.push("/inbox");
  }, [orderId, threadId, router, flushPending]);

  return { answers, saveState, progress, questions, saveAnswer, submitBrief };
}

// =============================================================================
// STEP 1 — BOOKING WIZARD (Sheet)
// =============================================================================

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

  const { form, pricing, status, unavailableDates, actions } = useVideoBookingLogic({
    artistId,
    basePriceZar,
    addOnLongZar,
    serviceId,
    onSuccess: (orderId, isDemo) => {
      // close sheet and route
      onClose();
      router.push(`/video-orders/${orderId}/pay${isDemo ? "?sim=1" : ""}`);
    },
  });

  const minDate = useMemo(() => new Date(Date.now() + 24 * 3600000).toISOString().slice(0, 10), []);

  const availabilityUi = useMemo(() => {
    if (!form.deliveryBy) return { tone: "muted" as const, label: "Select a date to check availability" };
    if (status.checking) return { tone: "loading" as const, label: "Checking availability…" };
    if (status.available === true) return { tone: "ok" as const, label: "Available" };
    if (status.available === false) return { tone: "bad" as const, label: "Not available for that date" };
    return { tone: "muted" as const, label: "Availability unknown (we’ll still try)" };
  }, [form.deliveryBy, status.checking, status.available]);

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" />
        </Transition.Child>

        {/* Bottom sheet (mobile) / centered modal (desktop) */}
        <div className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-6">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 translate-y-6 sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-6 sm:translate-y-0 sm:scale-95"
          >
            <Dialog.Panel className="w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[100dvh] sm:max-h-[90vh]">
              {/* Mobile handle */}
              <div className="sm:hidden flex justify-center pt-3">
                <div className="h-1.5 w-10 rounded-full bg-gray-200" />
              </div>

              {/* Header */}
              <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Dialog.Title className="text-base sm:text-lg font-semibold text-gray-900">
                      Book a personalised video
                    </Dialog.Title>
                    <p className="mt-1 text-xs sm:text-sm text-gray-500">
                      Set a delivery date and personalise your video details.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="shrink-0 rounded-full p-2 hover:bg-gray-50 text-gray-500 hover:text-gray-700"
                    aria-label="Close"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Left column */}
                  <div className="space-y-6">
                    {/* Delivery date */}
                    <section>
                      <div className="flex items-baseline justify-between gap-2">
                        <label className="block text-sm font-medium text-gray-800">Delivery date</label>
                        <div className="text-xs text-gray-500">Min: {minDate}</div>
                      </div>

                      <div className="mt-2">
                        <PersonalizedVideoDatePicker
                          value={form.deliveryBy}
                          minDateIso={minDate}
                          unavailableDates={unavailableDates}
                          onChange={form.setDeliveryBy}
                        />
                      </div>

                      <div className="mt-2 min-h-[1.25rem] text-xs">
                        {availabilityUi.tone === "loading" && (
                          <span className="inline-flex items-center gap-2 text-gray-600">
                            <Spinner size="sm" />
                            {availabilityUi.label}
                          </span>
                        )}
                        {availabilityUi.tone === "ok" && (
                          <span className="inline-flex items-center gap-2 text-emerald-700 font-medium">
                            <CheckBadgeIcon className="h-4 w-4" />
                            {availabilityUi.label}
                          </span>
                        )}
                        {availabilityUi.tone === "bad" && (
                          <span className="inline-flex items-center gap-2 text-red-600 font-medium">
                            <BoltIcon className="h-4 w-4" />
                            {availabilityUi.label}
                          </span>
                        )}
                        {availabilityUi.tone === "muted" && <span className="text-gray-500">{availabilityUi.label}</span>}
                      </div>

                      <p className="mt-2 text-xs text-gray-500">
                        Rush pricing can apply inside <span className="font-medium">24–48 hours</span>.
                      </p>
                    </section>
                  </div>

                  {/* Right column */}
                  <div className="space-y-4">
                    <TextInput
                      label="Recipient (optional)"
                      value={form.recipient}
                      onChange={(e: any) => form.setRecipient(e.target.value)}
                      placeholder="e.g. My mom, Sarah"
                    />

                    <TextInput
                      label="Promo code (optional)"
                      value={form.promo}
                      onChange={(e: any) => form.setPromo(e.target.value)}
                      placeholder="SAVE10"
                    />

                    {/* Video length */}
                    <section>
                      <label className="block text-sm font-medium text-gray-800">Video length</label>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {[
                          { v: "30_45" as LengthChoice, l: "30–45s", d: "Most popular" },
                          { v: "60_90" as LengthChoice, l: "60–90s", d: `+ ${formatCurrency(addOnLongZar)}` },
                        ].map((opt) => {
                          const active = form.lengthChoice === opt.v;
                          return (
                            <button
                              key={opt.v}
                              type="button"
                              onClick={() => form.setLengthChoice(opt.v)}
                              className={[
                                "rounded-xl border px-3 py-2.5 text-left transition",
                                active
                                  ? "border-black bg-black text-white shadow-sm"
                                  : "border-gray-200 bg-white hover:bg-gray-50 text-gray-700",
                              ].join(" ")}
                              aria-pressed={active}
                            >
                              <div className="text-sm font-semibold">{opt.l}</div>
                              <div className={["text-[11px]", active ? "text-gray-300" : "text-gray-500"].join(" ")}>
                                {opt.d}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    {/* Language */}
                    <section>
                      <label className="block text-sm font-medium text-gray-800">Language</label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {LANGS.map((l) => {
                          const active = form.language === l.v;
                          return (
                            <button
                              key={l.v}
                              type="button"
                              onClick={() => form.setLanguage(l.v)}
                              className={[
                                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                                active ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                              ].join(" ")}
                              aria-pressed={active}
                            >
                              {l.l}
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-xs text-emerald-900 flex gap-2">
                      <ShieldCheckIcon className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-medium">No charge yet</div>
                        <div className="text-emerald-800/80">You’ll review the total and confirm payment on the next screen.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sticky footer */}
              <div
                className="border-t border-gray-100 bg-white px-4 sm:px-6 pt-4"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <div className="text-sm text-gray-600">Total</div>
                      <div className="text-xl font-bold text-gray-900">{formatCurrency(pricing.total)}</div>
                      {pricing.discount > 0 && (
                        <div className="text-xs font-medium text-emerald-700">
                          ({formatCurrency(pricing.discount)} off)
                        </div>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">
                      Base {formatCurrency(pricing.basePriceZar)}
                      {pricing.priceAddOn > 0 ? ` • Length ${formatCurrency(pricing.priceAddOn)}` : ""}
                      {pricing.rushFee > 0 ? ` • Rush ${formatCurrency(pricing.rushFee)}` : ""}
                      {pricing.discount > 0 ? ` • Discount −${formatCurrency(pricing.discount)}` : ""}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    {status.disabledReason && (
                      <div className="sm:hidden text-xs text-gray-500">{status.disabledReason}</div>
                    )}

                    <Button
                      onClick={actions.createDraft}
                      disabled={!status.canContinue}
                      className="w-full sm:w-auto"
                      title={status.disabledReason || undefined}
                    >
                      {status.creating ? "Creating…" : "Continue to payment"}
                    </Button>

                    <button
                      type="button"
                      onClick={onClose}
                      className="hidden sm:inline-flex px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                {!status.canContinue && status.disabledReason && (
                  <div className="hidden sm:block mt-2 text-xs text-gray-500">{status.disabledReason}</div>
                )}
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}

// =============================================================================
// STEP 2 — PAYMENT PAGE
// =============================================================================

export function VideoPaymentPage({ orderId }: { orderId: number }) {
  const { loading, summary, error, reload, payWithPaystack, payWithDemo } = usePaymentLogic(orderId);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="text-red-600 font-medium">Unable to load order.</div>
          {error && <div className="mt-2 text-sm text-gray-600">{error}</div>}
          <div className="mt-4 flex gap-2">
            <Button onClick={reload}>Try again</Button>
            <Button variant="secondary" onClick={() => window.history.back()}>
              Go back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const canPaystack = USE_PAYSTACK && Boolean(PAYSTACK_PK);

  return (
    <div className="min-h-[100dvh] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-lg">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 sm:p-8 shadow-xl shadow-gray-200/50">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CreditCardIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-gray-900">Complete payment</h1>
              <p className="text-sm text-gray-500">Order #{orderId}</p>
            </div>
          </div>

          <div className="mt-6 rounded-xl bg-gray-50 p-4 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Delivery by</span>
              <span className="font-medium text-gray-900">{new Date(summary.delivery_by_utc).toLocaleDateString()}</span>
            </div>
            <div className="mt-2 flex justify-between gap-3">
              <span className="text-gray-500">Length</span>
              <span className="font-medium text-gray-900">~{summary.length_sec}s</span>
            </div>

            <div className="mt-3 border-t border-gray-200 pt-3">
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Base</span>
                <span className="font-medium text-gray-900">{formatCurrency(summary.price_base)}</span>
              </div>
              {summary.price_addons > 0 && (
                <div className="mt-2 flex justify-between gap-3">
                  <span className="text-gray-500">Length add-on</span>
                  <span className="font-medium text-gray-900">{formatCurrency(summary.price_addons)}</span>
                </div>
              )}
              {summary.price_rush > 0 && (
                <div className="mt-2 flex justify-between gap-3">
                  <span className="text-gray-500">Rush</span>
                  <span className="font-medium text-gray-900">{formatCurrency(summary.price_rush)}</span>
                </div>
              )}
              {summary.discount > 0 && (
                <div className="mt-2 flex justify-between gap-3">
                  <span className="text-gray-500">Discount</span>
                  <span className="font-medium text-emerald-700">−{formatCurrency(summary.discount)}</span>
                </div>
              )}

              <div className="mt-3 flex justify-between text-base">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="font-bold text-gray-900">{formatCurrency(summary.total)}</span>
              </div>
            </div>
          </div>

          <div className="mt-6">
            {canPaystack ? (
              <Button onClick={payWithPaystack} className="w-full h-11 text-base">
                Pay {formatCurrency(summary.total)}
              </Button>
            ) : (
              <Button onClick={payWithDemo} variant="secondary" className="w-full h-11 text-base">
                Simulate payment (demo)
              </Button>
            )}
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500">
            <ShieldCheckIcon className="h-4 w-4" />
            <span>{canPaystack ? "Payments processed securely." : "Payment provider not configured (demo mode)."}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// STEP 3 — BRIEF PAGE
// =============================================================================

export function VideoChatBrief({ orderId, threadId }: { orderId: number; threadId?: number }) {
  const { answers, saveState, progress, questions, saveAnswer, submitBrief } = useBriefLogic(orderId, threadId);

  const saveLabel = useMemo(() => {
    if (saveState === "saving") return "Saving…";
    if (saveState === "saved") return "Saved";
    if (saveState === "error") return "Offline — will retry";
    return "Autosave on";
  }, [saveState]);

  const percent = progress.total > 0 ? Math.round((progress.answered / progress.total) * 100) : 0;

  return (
    <div className="min-h-[100dvh] mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 border-b border-gray-100 pb-5">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Video brief</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
            <span>Order #{orderId}</span>
            <span aria-hidden className="text-gray-300">•</span>
            <span className="font-medium text-emerald-700">
              {progress.answered}/{progress.total} completed
            </span>
            <span aria-hidden className="text-gray-300">•</span>
            <span className={saveState === "error" ? "text-amber-700 font-medium" : "text-gray-500"}>{saveLabel}</span>
          </div>

          <div className="mt-3">
            <div className="w-full h-2 rounded bg-gray-100" aria-hidden="true">
              <div className="h-2 rounded bg-black" style={{ width: `${percent}%` }} />
            </div>
          </div>
        </div>

        <button
          onClick={() => typeof window !== "undefined" && window.print()}
          className="no-print inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 self-start sm:self-auto"
          type="button"
        >
          <PrinterIcon className="h-4 w-4" />
          Print
        </button>
      </div>

      {/* Guidance */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700">
        Tip: Keep it simple — the artist can improvise if you give a few strong personal details.
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((q) => (
          <div key={q.key} className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <label className="block text-sm font-semibold text-gray-900">{q.label}</label>
              {answers[q.key] != null && String(answers[q.key]).trim?.() ? (
                <span className="text-xs font-medium text-emerald-700">Answered</span>
              ) : (
                <span className="text-xs text-gray-400">Optional</span>
              )}
            </div>

            {"helper" in q && q.helper ? <p className="mt-1 text-xs text-gray-500">{q.helper}</p> : null}

            {q.type === "text" ? (
              <div className="mt-3">
                <TextArea
                  rows={q.rows ?? 3}
                  className="w-full resize-none rounded-xl border-gray-200 text-sm focus:border-black focus:ring-black"
                  placeholder={q.placeholder || "Type here…"}
                  value={answers[q.key] || ""}
                  onChange={(e: any) => saveAnswer(q.key, e.target.value)}
                  onBlur={() => saveAnswer(q.key, answers[q.key] || "", { immediate: true })}
                />
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {q.options.map((opt) => {
                  const active = answers[q.key] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => saveAnswer(q.key, opt, { immediate: true })}
                      className={[
                        "rounded-full px-3 py-1.5 text-xs font-medium border transition",
                        active
                          ? "border-black bg-black text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                      ].join(" ")}
                      aria-pressed={active}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Sticky action bar */}
      <div className="no-print sticky bottom-0 z-10">
        <div
          className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white/90 backdrop-blur px-3 py-2 shadow-xl flex items-center gap-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
        >
          <div className="min-w-0 flex-1">
            <div className="text-xs text-gray-500">Autosave on • You can come back anytime</div>
            <div className="text-sm font-medium text-gray-900">
              Progress: {progress.answered}/{progress.total}
            </div>
          </div>

          <Button onClick={submitBrief} className="shrink-0">
            <ChatBubbleBottomCenterTextIcon className="h-4 w-4 mr-2" />
            Mark complete
          </Button>
        </div>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          textarea,
          input {
            border: none !important;
            padding: 0 !important;
            box-shadow: none !important;
            resize: none !important;
          }
        }
      `}</style>
    </div>
  );
}
