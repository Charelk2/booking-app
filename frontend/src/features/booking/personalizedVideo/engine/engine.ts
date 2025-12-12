import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ui";
import { getServiceProviderAvailability } from "@/lib/api";
import {
  PersonalizedVideoEngine,
  PersonalizedVideoEngineParams,
} from "./types";
import { pvStorage } from "./storage";
import { VideoOrder, videoOrderApiClient } from "./apiClient";
import {
  createPersonalizedVideoEngineCore,
  PvEngineCore,
  PvEngineEnv,
} from "./core";

const PAYSTACK_CURRENCY =
  process.env.NEXT_PUBLIC_PAYSTACK_CURRENCY || "ZAR";
const USE_PAYSTACK = process.env.NEXT_PUBLIC_USE_PAYSTACK === "1";
const ENABLE_PV_ORDERS =
  (process.env.NEXT_PUBLIC_ENABLE_PV_ORDERS ?? "") === "1";
const PAYSTACK_PK =
  process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ||
  process.env.NEXT_PUBLIC_PAYSTACK_PK;

export type BriefQuestion =
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

export const BRIEF_QUESTIONS: BriefQuestion[] = [
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
    options: [
      "Birthday",
      "Anniversary",
      "Pep talk",
      "Congratulations",
      "Roast",
      "Just because",
    ],
  },
  {
    key: "script_points",
    label: "What should the artist say? (3–5 bullets)",
    type: "text",
    placeholder:
      "• Mention the promotion\n• Congratulate on graduating\n• Inside joke about the dog…",
    rows: 4,
  },
  {
    key: "inside_jokes",
    label: "Inside jokes / special details",
    type: "text",
    placeholder: "Anything that makes it feel personal?",
  },
  {
    key: "avoid",
    label: "Anything to avoid?",
    type: "text",
    placeholder: "Sensitive topics, names, jokes, etc.",
  },
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
    placeholder:
      "Paste links to photos, music, or examples (Google Drive, Dropbox, etc.)",
    rows: 3,
  },
];

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

// React hook wrapper around the headless PV engine core.
export function usePersonalizedVideoOrderEngine(
  params: PersonalizedVideoEngineParams,
): PersonalizedVideoEngine {
  const router = useRouter();
  const coreRef = useRef<PvEngineCore | null>(null);
  const canPay = USE_PAYSTACK && Boolean(PAYSTACK_PK);

  if (!coreRef.current) {
    const env: PvEngineEnv = {
      now: () => new Date(),
      api: videoOrderApiClient,
      storage: pvStorage,
      availability: {
        async getUnavailableDates(artistId: number): Promise<string[]> {
          try {
            const res = await getServiceProviderAvailability(artistId);
            return (res?.data?.unavailable_dates || []) as string[];
          } catch {
            return [];
          }
        },
      },
      ui: {
        toastSuccess(message: string) {
          Toast.success(message);
        },
        toastInfo(message: string) {
          Toast(message);
        },
        navigateToPayment(orderId: number, isDemo: boolean) {
          if (params.onDraftCreated) {
            params.onDraftCreated(orderId, isDemo);
            return;
          }
          const suffix = isDemo ? "?sim=1" : "";
          router.push(`/video-orders/${orderId}/pay${suffix}`);
        },
        navigateToBrief(orderId: number) {
          router.push(`/video-orders/${orderId}/brief`);
        },
        navigateToInbox(threadId?: number | string) {
          if (threadId) {
            router.push(`/inbox?requestId=${threadId}`);
          } else {
            router.push("/inbox");
          }
        },
      },
      payments: {
        async startPayment(args: {
          order: VideoOrder;
          onSuccess(reference?: string): void;
          onError(message: string): void;
        }): Promise<void> {
          const { order, onSuccess, onError } = args;

          // Demo mode when Paystack is not configured.
          if (!USE_PAYSTACK || !PAYSTACK_PK) {
            if (ENABLE_PV_ORDERS) {
              onError("Paystack is not configured.");
              return;
            }
            try {
              await onSuccess();
            } catch {
              // ignore
            }
            return;
          }

          try {
            await loadPaystackScript();
            const PaystackPop = (window as any).PaystackPop;

            const amountZar = (() => {
              if (ENABLE_PV_ORDERS) {
                const v = (order as any)?.totals_preview?.client_total_incl_vat;
                if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
              }
              const fallback = Number((order as any)?.total || 0);
              return Number.isFinite(fallback) ? fallback : 0;
            })();

            const handler = PaystackPop.setup({
              key: PAYSTACK_PK,
              email:
                order.contact_email ||
                `pv-buyer-${order.id}@example.com`,
              amount: Math.round(
                Math.max(0, amountZar) * 100,
              ),
              currency: PAYSTACK_CURRENCY,
              metadata: {
                order_id: order.id,
                purpose: "personalized_video",
                amount_zar: amountZar,
              },
              callback: (res: { reference: string }) => {
                onSuccess(res?.reference);
              },
              onClose: () => {
                Toast("Payment window closed");
              },
            });

            handler.openIframe();
          } catch (e: any) {
            onError(e?.message || "Unable to start payment");
          }
        },
      },
      enablePvOrders: ENABLE_PV_ORDERS,
      briefTotalQuestions: BRIEF_QUESTIONS.length,
      canPay,
    };

    coreRef.current = createPersonalizedVideoEngineCore(env, params);
  }

  const core = coreRef.current!;

  const [state, setState] =
    useState<PersonalizedVideoEngine["state"]>(() => core.getState());

  useEffect(() => {
    const unsubscribe = core.subscribe((next) => {
      setState(next);
    });
    return unsubscribe;
  }, [core]);

  // Auto-load order summary when an orderId is provided (payment/brief pages).
  useEffect(() => {
    if (!params.orderId) return;
    void core.actions.reloadOrderSummary();
  }, [core, params.orderId]);

  // Auto-check availability when in draft step and artistId/date are present.
  useEffect(() => {
    if (!params.artistId) return;
    if (state.stepId !== "draft") return;
    if (!state.draft.deliveryBy) return;
    void core.actions.checkAvailability();
  }, [core, params.artistId, state.stepId, state.draft.deliveryBy]);

  return { state, actions: core.actions };
}
