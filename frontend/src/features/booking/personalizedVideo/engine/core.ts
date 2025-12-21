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
  enablePvOrders: boolean;
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

const MS_PER_DAY = 24 * 3600000;

function utcStartOfDayMs(dt: Date): number {
  return Date.UTC(
    dt.getUTCFullYear(),
    dt.getUTCMonth(),
    dt.getUTCDate(),
    0,
    0,
    0,
    0,
  );
}

function isoDayToUtcMs(day: string): number | null {
  const raw = String(day || "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const date = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(date)) return null;
  return Date.UTC(year, month - 1, date, 0, 0, 0, 0);
}

function daysUntilUtc(day: string, now: Date): number | null {
  const target = isoDayToUtcMs(day);
  if (target == null) return null;
  const today = utcStartOfDayMs(now);
  return Math.round((target - today) / MS_PER_DAY);
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
  const computeBriefAnsweredCount = (answers: Record<string, any>): number => {
    return Object.keys(answers).filter((k) => {
      const v = (answers as any)[k];
      if (typeof v === "string") return v.trim().length > 0;
      return v != null;
    }).length;
  };

  const minNoticeDays = (() => {
    const n = Number(params.minNoticeDays ?? 1);
    if (!Number.isFinite(n)) return 1;
    return Math.max(0, Math.min(365, Math.trunc(n)));
  })();

  const rushCustomEnabled = Boolean(params.rushCustomEnabled);
  const rushFeeZar = (() => {
    const n = Number(params.rushFeeZar ?? 0);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.round(n));
  })();
  const rushWithinDays = (() => {
    const n = Number(params.rushWithinDays ?? 2);
    if (!Number.isFinite(n)) return 2;
    return Math.max(0, Math.min(30, Math.trunc(n)));
  })();

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
  let saveSeq = 0;

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
    const daysUntil = draft.deliveryBy ? daysUntilUtc(draft.deliveryBy, env.now()) : null;
    if (daysUntil != null && daysUntil >= 0) {
      if (rushCustomEnabled) {
        if (rushWithinDays > 0 && rushFeeZar > 0 && daysUntil <= rushWithinDays) {
          rushFee = rushFeeZar;
        }
      } else {
        // Legacy rush pricing (kept for backward compatibility with existing services).
        if (daysUntil <= 1) rushFee = Math.round(base * 0.75);
        else if (daysUntil <= 2) rushFee = Math.round(base * 0.4);
      }
    }

    const code = draft.promo.trim().toUpperCase();
    const subtotal = base + addOn + rushFee;
    const discount =
      code === "SAVE10" ? Math.round(subtotal * 0.1) : 0;
    const total = Math.max(0, subtotal - discount);

    const lengthSec = draft.lengthChoice === "30_45" ? 40 : 75;
    const meetsNotice =
      !draft.deliveryBy ||
      (daysUntil != null && daysUntil >= minNoticeDays);

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
          meetsNotice &&
          s.status.available !== false &&
          !!draft.deliveryBy &&
          total > 0,
        disabledReason:
          !draft.deliveryBy
            ? "Choose a delivery date"
            : !meetsNotice
            ? `Requires at least ${minNoticeDays} day${minNoticeDays === 1 ? "" : "s"} notice`
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

    prefetchUnavailableDates: async () => {
      const s = getState();
      const artistId = params.artistId;
      if (!artistId) return;
      if (s.unavailableDates.length) return;
      try {
        const unavailableDates = await env.availability.getUnavailableDates(artistId);
        setState({ unavailableDates: Array.isArray(unavailableDates) ? unavailableDates : [] });
      } catch {
        // best-effort
      }
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

      const noticeDaysUntil = daysUntilUtc(deliveryBy, env.now());
      if (noticeDaysUntil == null || noticeDaysUntil < minNoticeDays) {
        setState({
          availabilityStatus: "unavailable",
          status: {
            ...getState().status,
            checking: false,
            available: false,
          },
        });
        recalcPricingInternal();
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
          service_id: params.serviceId,
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

        const idempotency = `vo-${artistId}-${params.serviceId || 0}-${draft.deliveryBy}-${lengthSec}-${pricing.total}`;
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

        if (env.enablePvOrders) {
          env.storage.saveThreadIdForOrder(res.id, res.id);
          env.storage.saveOrderIdForThread(res.id, res.id);
        } else {
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

      const storedAnswersRaw = env.storage.loadBriefAnswers(id);
      const storedAnswers =
        storedAnswersRaw && typeof storedAnswersRaw === "object"
          ? storedAnswersRaw
          : {};

      let order: VideoOrder | null = null;
      try {
        order = await env.api.getOrder(id);
      } catch {
        order = null;
      }

      currentOrder = order;

      const hasOrder = !!order;
      const payment = getState().payment;

      const serverAnswersRaw = (order as any)?.answers;
      const serverAnswers =
        serverAnswersRaw && typeof serverAnswersRaw === "object"
          ? (serverAnswersRaw as Record<string, any>)
          : {};
      const currentAnswers = getState().brief.answers || {};
      const mergedAnswers = {
        ...serverAnswers,
        ...storedAnswers,
        ...currentAnswers,
      };
      const answered = computeBriefAnsweredCount(mergedAnswers);
      try {
        if (Object.keys(mergedAnswers).length) {
          env.storage.saveBriefAnswers(id, mergedAnswers);
        }
      } catch {}

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
		              clientTotalInclVat: (() => {
		                const raw = (order as any)?.totals_preview?.client_total_incl_vat;
		                const n = typeof raw === "number" ? raw : Number(raw);
		                return Number.isFinite(n) ? n : null;
		              })(),
		            }
		          : null,
            brief: {
              ...getState().brief,
              answers: mergedAnswers,
              progress: { answered, total: env.briefTotalQuestions },
              saveState: Object.keys(mergedAnswers).length ? "saved" : getState().brief.saveState,
            },
		        payment: {
		          ...payment,
		          loading: false,
		          error: hasOrder
	            ? null
	            : "Please check your connection and try again.",
	        },
	      });
    },

    applyPromoCode: async (promoCode) => {
      const id = getState().orderId;
      if (!id) return false;

      const cleaned = String(promoCode || "").trim().toUpperCase();

      setState({
        payment: { ...getState().payment, loading: true, error: null },
      });

      let updated: VideoOrder | null = null;
      let errorMessage: string | null = null;
      try {
        updated = await env.api.applyPromo(id, cleaned);
      } catch (e: any) {
        errorMessage = e?.message || null;
        updated = null;
      }

      if (!updated) {
        setState({
          payment: {
            ...getState().payment,
            loading: false,
            error: errorMessage || "Unable to apply promo code. Please try again.",
          },
        });
        return false;
      }

      currentOrder = updated;

      const storedAnswersRaw = env.storage.loadBriefAnswers(id);
      const storedAnswers =
        storedAnswersRaw && typeof storedAnswersRaw === "object"
          ? storedAnswersRaw
          : {};
      const serverAnswersRaw = (updated as any)?.answers;
      const serverAnswers =
        serverAnswersRaw && typeof serverAnswersRaw === "object"
          ? (serverAnswersRaw as Record<string, any>)
          : {};
      const currentAnswers = getState().brief.answers || {};
      const mergedAnswers = {
        ...serverAnswers,
        ...storedAnswers,
        ...currentAnswers,
      };
      const answered = computeBriefAnsweredCount(mergedAnswers);
      try {
        if (Object.keys(mergedAnswers).length) {
          env.storage.saveBriefAnswers(id, mergedAnswers);
        }
      } catch {}

      setState({
        orderSummary: {
          id: updated.id,
          artistId: updated.artist_id,
          buyerId: updated.buyer_id,
          status: updated.status,
          deliveryByUtc: updated.delivery_by_utc,
          lengthSec: updated.length_sec,
          language: updated.language,
          total: updated.total,
          priceBase: updated.price_base,
          priceRush: updated.price_rush,
          priceAddons: updated.price_addons,
          discount: updated.discount,
          clientTotalInclVat: (() => {
            const raw = (updated as any)?.totals_preview?.client_total_incl_vat;
            const n = typeof raw === "number" ? raw : Number(raw);
            return Number.isFinite(n) ? n : null;
          })(),
        },
        brief: {
          ...getState().brief,
          answers: mergedAnswers,
          progress: { answered, total: env.briefTotalQuestions },
          saveState: Object.keys(mergedAnswers).length ? "saved" : getState().brief.saveState,
        },
        payment: { ...getState().payment, loading: false, error: null },
      });

      return true;
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
        if (env.enablePvOrders) {
          const ref = String(_reference || "").trim();
          if (!ref) {
            setState({
              payment: {
                ...getState().payment,
                error: "Payment reference missing. Please try again.",
              },
            });
            return;
          }
          const verified = await env.api.verifyPaystack(id, ref);
          if (!verified) {
            setState({
              payment: {
                ...getState().payment,
                error: "Payment verification failed. Please try again.",
              },
            });
            return;
          }
          currentOrder = verified;
        } else {
          await env.api.updateStatus(id, "paid");
        }
      } catch (e) {
        setState({
          payment: { ...getState().payment, error: "Failed to update payment status. Please refresh." },
        });
        return;
      }

      env.ui.toastSuccess("Payment received!");
      try {
        let tid: string | number | null = env.storage.getThreadIdForOrder(id);
        if (!tid && env.enablePvOrders) {
          tid = String(id);
          env.storage.saveThreadIdForOrder(id, id);
          env.storage.saveOrderIdForThread(id, id);
        } else if (!tid && params.serviceId) {
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

    updateAnswer: (key, value, opts) => {
      const s = getState();
      const answers = { ...s.brief.answers, [key]: value };
      if (s.orderId) {
        env.storage.saveBriefAnswers(s.orderId, answers);
      }
      setState({
        brief: { ...s.brief, answers, saveState: opts?.immediate ? "saving" : "saved" },
      });
      setState({
        brief: {
          ...getState().brief,
          progress: { answered: computeBriefAnsweredCount(answers), total: env.briefTotalQuestions },
        },
      });

      if (opts?.immediate && s.orderId) {
        const mySeq = ++saveSeq;
        void (async () => {
          const ok = await env.api.postAnswer(s.orderId as number, key, value);
          if (mySeq !== saveSeq) return;
          setState({
            brief: { ...getState().brief, saveState: ok ? "saved" : "error" },
          });
        })();
      }
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
        env.storage.markBriefComplete(id);
      } catch {
        // best-effort
      }

      env.ui.toastSuccess("Brief submitted. The artist has been notified.");
      try {
        const tid =
          env.storage.getThreadIdForOrder(id) || (env.enablePvOrders ? String(id) : null);
        if (tid) {
          env.ui.navigateToInbox(tid);
          return;
        }
      } catch {
        // ignore
      }
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
