import {
  PersonalizedVideoEngine,
  PersonalizedVideoEngineParams,
} from "./types";
import {
  VideoOrder,
  VideoOrderDraftPayload,
  VideoOrderApiClient,
} from "./apiClient";
import { PersonalizedVideoStorage } from "./storage";

export interface PvAvailabilityEnv {
  getUnavailableDates(artistId: number): Promise<string[]>;
}

export interface PvUiEnv {
  toastSuccess(message: string): void;
  toastInfo(message: string): void;
  navigateToPayment(orderId: number, isDemo: boolean): void;
  navigateToBrief(orderId: number): void;
  navigateToInbox(threadId?: number | string): void;
}

export interface PvPaymentsEnv {
  startPayment(args: {
    order: VideoOrder;
    onSuccess(reference?: string): void;
    onError(message: string): void;
  }): Promise<void> | void;
}

export interface PvEngineEnv {
  now(): Date;
  api: VideoOrderApiClient;
  storage: PersonalizedVideoStorage;
  availability: PvAvailabilityEnv;
  ui: PvUiEnv;
  payments: PvPaymentsEnv;
  briefTotalQuestions: number;
   canPay: boolean;
}

export interface PvEngineCore {
  getState(): PersonalizedVideoEngine["state"];
  subscribe(
    listener: (state: PersonalizedVideoEngine["state"]) => void,
  ): () => void;
  actions: PersonalizedVideoEngine["actions"];
}

type LengthChoice = "30_45" | "60_90";

function computeRushFee(base: number, deliveryBy: Date, now: Date): number {
  const hours = Math.max(0, (deliveryBy.getTime() - now.getTime()) / 3600000);
  if (hours <= 24) return Math.round(base * 0.75);
  if (hours <= 48) return Math.round(base * 0.4);
  return 0;
}

function toIsoDateUtc(day: string): string {
  const [y, m, d] = day.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1, 0, 0, 0));
  return dt.toISOString();
}

export function createPersonalizedVideoEngineCore(
  env: PvEngineEnv,
  params: PersonalizedVideoEngineParams,
): PvEngineCore {
  let state: PersonalizedVideoEngine["state"] = {
    stepId: "draft",
    draft: {
      deliveryBy: "",
      lengthChoice: "30_45",
      language: "EN",
      recipient: "",
      promo: "",
    },
    unavailableDates: [],
    availabilityStatus: "idle",
    status: {
      checking: false,
      available: null,
      canContinue: false,
      disabledReason: "Choose a delivery date",
    },
    pricing: {
      basePriceZar: params.basePriceZar,
      rushFee: 0,
      addOnLongZar: params.addOnLongZar,
      priceAddOn: 0,
      discount: 0,
      total: params.basePriceZar,
      lengthSec: 40,
    },
    orderId: params.orderId ?? null,
    orderSummary: null,
    payment: {
      loading: false,
      error: null,
      canPay: env.canPay,
    },
    brief: {
      answers: {},
      progress: { answered: 0, total: env.briefTotalQuestions },
      saveState: "idle",
    },
    flags: {
      creatingDraft: false,
      hasSavedDraft: false,
      loadingFromStorage: false,
    },
  };

  let currentOrder: VideoOrder | null = null;

  const listeners = new Set<(s: typeof state) => void>();

  const getState = () => state;

  const notify = () => {
    listeners.forEach((l) => l(state));
  };

  const setState = (partial: Partial<typeof state>) => {
    state = { ...state, ...partial };
    notify();
  };

  const recalcPricingInternal = () => {
    const s = getState();
    const { draft } = s;
    const base = s.pricing.basePriceZar;
    const addOn =
      draft.lengthChoice === "60_90" ? s.pricing.addOnLongZar : 0;

    let rushFee = 0;
    if (draft.deliveryBy) {
      const deliveryDate = new Date(`${draft.deliveryBy}T00:00:00`);
      rushFee = computeRushFee(base, deliveryDate, env.now());
    }

    const code = draft.promo.trim().toUpperCase();
    const subtotal = base + addOn + rushFee;
    const discount =
      code === "SAVE10" ? Math.round(subtotal * 0.1) : 0;
    const total = Math.max(0, subtotal - discount);

    const lengthSec = draft.lengthChoice === "30_45" ? 40 : 75;

    setState({
      pricing: {
        basePriceZar: base,
        rushFee,
        addOnLongZar: s.pricing.addOnLongZar,
        priceAddOn: addOn,
        discount,
        total,
        lengthSec,
      },
      status: {
        ...s.status,
        canContinue:
          s.status.available !== false &&
          !!draft.deliveryBy &&
          total > 0,
        disabledReason:
          !draft.deliveryBy
            ? "Choose a delivery date"
            : s.status.available === false
            ? "Not available for that date"
            : total <= 0
            ? "Total must be greater than 0"
            : null,
      },
    });
  };

  const recomputeBriefProgress = () => {
    const s = getState();
    const answers = s.brief.answers;
    const answered = Object.keys(answers).filter((k) => {
      const v = (answers as any)[k];
      if (typeof v === "string") return v.trim().length > 0;
      return v != null;
    }).length;
    setState({
      brief: {
        ...s.brief,
        progress: { answered, total: env.briefTotalQuestions },
      },
    });
  };

  const actions: PersonalizedVideoEngine["actions"] = {
    goToStep: (id) => {
      setState({ stepId: id });
    },

    updateDraftField: (key, value) => {
      const s = getState();
      setState({
        draft: { ...s.draft, [key]: value } as typeof s.draft,
      });
      recalcPricingInternal();
    },

    recalcPricing: () => {
      recalcPricingInternal();
    },

    checkAvailability: async () => {
      const s = getState();
      const artistId = params.artistId;
      const deliveryBy = s.draft.deliveryBy;

      if (!artistId) {
        setState({
          availabilityStatus: "idle",
          status: {
            ...s.status,
            checking: false,
            available: null,
          },
        });
        return;
      }

      setState({
        availabilityStatus: "checking",
        status: { ...s.status, checking: true },
      });

      let unavailableDates = s.unavailableDates;
      if (!unavailableDates.length) {
        try {
          unavailableDates = await env.availability.getUnavailableDates(
            artistId,
          );
        } catch {
          unavailableDates = [];
        }
        setState({ unavailableDates });
      }

      if (!deliveryBy) {
        setState({
          availabilityStatus: "idle",
          status: {
            ...getState().status,
            checking: false,
            available: null,
          },
        });
        return;
      }

      const isUnavailable = unavailableDates.includes(deliveryBy);
      const available =
        unavailableDates.length === 0 ? true : !isUnavailable;

      const nextStatus: typeof state.status = {
        ...getState().status,
        checking: false,
        available,
      };

      setState({
        availabilityStatus: available ? "available" : "unavailable",
        status: nextStatus,
      });

      recalcPricingInternal();
    },

    createOrUpdateDraft: async () => {
      const s = getState();
      const artistId = params.artistId;
      if (!artistId) return;

      const { draft, pricing } = s;
      if (!draft.deliveryBy) return;

      setState({
        flags: { ...s.flags, creatingDraft: true },
      });

      try {
        const lengthSec =
          draft.lengthChoice === "30_45" ? 40 : 75;
        const payload: VideoOrderDraftPayload = {
          artist_id: artistId,
          delivery_by_utc: toIsoDateUtc(draft.deliveryBy),
          length_sec: lengthSec,
          language: draft.language,
          tone: "Cheerful",
          recipient_name: draft.recipient || undefined,
          contact_email: undefined,
          contact_whatsapp: undefined,
          promo_code: draft.promo || undefined,
          price_base: pricing.basePriceZar,
          price_rush: pricing.rushFee,
          price_addons: pricing.priceAddOn,
          discount: pricing.discount,
          total: pricing.total,
        };

        const idempotency = `vo-${artistId}-${draft.deliveryBy}-${lengthSec}-${pricing.total}`;
        const res = await env.api.createOrder(payload, idempotency);

        const seed = {
          delivery_by_utc: payload.delivery_by_utc,
          length_label:
            draft.lengthChoice === "30_45" ? "30–45s" : "60–90s",
          contact_email: undefined,
          contact_whatsapp: undefined,
          language: draft.language,
          tone: "Cheerful",
          recipient_name: draft.recipient,
        };

        if (!res) {
          setState({
            flags: { ...getState().flags, creatingDraft: false },
            payment: { ...getState().payment, error: "Could not create order. Please try again." },
          });
          return;
        }

        env.storage.saveBriefSeed(res.id, seed);

        const serviceId = params.serviceId;
        if (serviceId) {
          const threadId = await env.api.createThreadForOrder(
            artistId,
            serviceId,
            res.id,
            `vo-thread-${res.id}`,
          );
          if (threadId) {
            env.storage.saveThreadIdForOrder(res.id, threadId);
            env.storage.saveOrderIdForThread(threadId, res.id);
          }
        }

        env.ui.toastSuccess("Order created — continue to payment");
        setState({
          orderId: res.id,
          stepId: "payment",
          flags: { ...getState().flags, creatingDraft: false },
        });
        env.ui.navigateToPayment(res.id, false);
      } finally {
        const s2 = getState();
        setState({
          flags: { ...s2.flags, creatingDraft: false },
        });
      }
    },

    loadDraftFromStorage: async () => {
      // Not implemented for PV yet.
      return;
    },

    discardDraft: async () => {
      // Not implemented for PV yet.
      return;
    },

    reloadOrderSummary: async () => {
      const id = getState().orderId;
      if (!id) return;

      setState({
        payment: { ...getState().payment, loading: true, error: null },
      });

      let order: VideoOrder | null = null;
      try {
        order = await env.api.getOrder(id);
      } catch {
        order = null;
      }

      currentOrder = order;

      const hasOrder = !!order;
      const payment = getState().payment;

      setState({
        orderSummary: hasOrder && order
          ? {
              id: order.id,
              artistId: order.artist_id,
              buyerId: order.buyer_id,
              status: order.status,
              deliveryByUtc: order.delivery_by_utc,
              lengthSec: order.length_sec,
              language: order.language,
              total: order.total,
              priceBase: order.price_base,
              priceRush: order.price_rush,
              priceAddons: order.price_addons,
              discount: order.discount,
            }
          : null,
        payment: {
          ...payment,
          loading: false,
          error: hasOrder
            ? null
            : "Please check your connection and try again.",
        },
      });
    },

    startPayment: async () => {
      const id = getState().orderId;
      if (!id) return;

      if (!currentOrder) {
        await actions.reloadOrderSummary();
      }

      const order = currentOrder;
      if (!order) {
        setState({
          payment: { ...getState().payment, loading: false, error: "Order not found. Please retry." },
        });
        return;
      }

      setState({
        payment: { ...getState().payment, loading: true, error: null },
      });

      await env.payments.startPayment({
        order,
        onSuccess: async (ref) => {
          await actions.markPaid(ref);
          setState({
            payment: { ...getState().payment, loading: false },
          });
        },
        onError: (message) => {
          setState({
            payment: {
              ...getState().payment,
              loading: false,
              error: message,
            },
          });
        },
      });
    },

    markPaid: async (_reference) => {
      const id = getState().orderId;
      if (!id) return;

      try {
        await env.api.updateStatus(id, "paid");
      } catch (e) {
        setState({
          payment: { ...getState().payment, error: "Failed to update payment status. Please refresh." },
        });
        return;
      }

      env.ui.toastSuccess("Payment received!");
      try {
        let tid = env.storage.getThreadIdForOrder(id);
        if (!tid && params.serviceId) {
          const created = await env.api.createThreadForOrder(
            params.artistId,
            params.serviceId,
            id,
            `vo-thread-${id}`,
          );
          if (created) {
            tid = created;
            env.storage.saveThreadIdForOrder(id, created);
            env.storage.saveOrderIdForThread(created, id);
          }
        }
        if (tid) {
          env.ui.navigateToInbox(tid);
          return;
        }
      } catch {
        // ignore
      }
      env.ui.navigateToInbox();
    },

    updateAnswer: (key, value, _opts) => {
      const s = getState();
      const answers = { ...s.brief.answers, [key]: value };
      if (s.orderId) {
        env.storage.saveBriefAnswers(s.orderId, answers);
      }
      setState({
        brief: { ...s.brief, answers, saveState: "saving" },
      });
      recomputeBriefProgress();
    },

    flushAnswers: async () => {
      const s = getState();
      const id = s.orderId;
      if (!id) return;

      const entries = Object.entries(s.brief.answers);
      if (!entries.length) return;

      let anyFailed = false;
      for (const [key, value] of entries) {
        const ok = await env.api.postAnswer(id, key, value);
        if (!ok) {
          anyFailed = true;
        }
      }

      setState({
        brief: {
          ...getState().brief,
          saveState: anyFailed ? "error" : "saved",
        },
      });
    },

    submitBrief: async () => {
      const s = getState();
      const id = s.orderId;
      if (!id) return;

      await actions.flushAnswers();
      await env.api.updateStatus(id, "in_production");

      try {
        const tid = env.storage.getThreadIdForOrder(id);
        if (tid) {
          const briefUrl = `/video-orders/${id}/brief`;
          await env.api.postThreadMessage(
            tid,
            `Brief complete for order #${id}. Ready to start production. View brief: ${briefUrl}`,
          );
          env.storage.markBriefComplete(id);
          env.ui.toastSuccess(
            "Brief submitted. The artist has been notified.",
          );
          env.ui.navigateToInbox(tid);
          return;
        }
      } catch {
        // best-effort
      }

      env.ui.toastSuccess("Brief submitted.");
      env.ui.navigateToInbox();
    },
  };

  return {
    getState,
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    actions,
  };
}
