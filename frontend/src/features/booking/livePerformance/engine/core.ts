import { initialDetails } from "@/contexts/BookingContext";
import type { EventDetails } from "@/contexts/BookingContext";
import {
  type LiveBookingEngine,
  type LiveBookingEngineActions,
  type LiveBookingEngineParams,
  type LiveBookingEngineState,
  type LiveBookingStepId,
} from "./types";
import { bookingWizardStepFields } from "@/lib/shared/validation/booking";

export interface LiveEnv {
  now(): Date;
  availability: {
    getUnavailableDates(artistId: number): Promise<string[]>;
  };
  quoteApi: {
    estimateQuote(payload: any): Promise<any>;
  };
  bookingApi: {
    createDraft(payload: any): Promise<{ id: number }>;
    updateDraft(id: number, payload: any): Promise<void>;
    submit(id: number, payload: any): Promise<void>;
    postSystemMessage(
      bookingRequestId: number,
      content: string,
    ): Promise<void>;
  };
  storage: {
    loadDraft(
      key: string,
    ): Promise<{ details: EventDetails; requestId: number | null } | null>;
    saveDraft(
      key: string,
      snapshot: { details: EventDetails; requestId: number | null },
    ): Promise<void>;
    clearDraft(key: string): Promise<void>;
  };
  offline: {
    isOffline(): boolean;
    enqueue(action: () => Promise<void>): void;
  };
  log?: (event: string, data?: any) => void;
}

export interface LiveBookingEngineCore {
  getState(): LiveBookingEngineState;
  subscribe(
    listener: (s: LiveBookingEngineState) => void,
  ): () => void;
  actions: LiveBookingEngineActions;
}

const defaultSteps: LiveBookingStepId[] = [
  "description",
  "location",
  "dateTime",
  "eventType",
  "guests",
  "venue",
  "sound",
  "notes",
  "review",
];

export function createLiveBookingEngineCore(
  env: LiveEnv,
  params: LiveBookingEngineParams,
): LiveBookingEngineCore {
  let state: LiveBookingEngineState = {
    stepId: defaultSteps[0]!,
    stepIndex: 0,
    steps: defaultSteps,
    details: { ...initialDetails },
    availability: {
      unavailableDates: [],
      status: "idle",
    },
    quote: {
      items: [],
      total: null,
      travel: null,
      soundCost: null,
      isDirty: false,
    },
    booking: {
      requestId: null,
      status: "idle",
    },
    flags: {
      loadingInitial: false,
      savingDraft: false,
      submitting: false,
      offline: false,
    },
    validation: {
      currentStepErrors: [],
      globalError: null,
    },
  };

  const listeners = new Set<(s: LiveBookingEngineState) => void>();
  const getState = () => state;
  const notify = () => {
    listeners.forEach((l) => l(state));
  };
  const setState = (partial: Partial<LiveBookingEngineState>) => {
    state = { ...state, ...partial };
    notify();
  };

  const getDraftKey = () =>
    `live:${params.artistId}:${params.serviceId}`;

  const updateDetails = (patch: Partial<EventDetails>) => {
    state = {
      ...state,
      details: { ...state.details, ...patch },
      quote: { ...state.quote, isDirty: true },
    };
    notify();
  };

  const validateCurrentStep = (): string[] => {
    const idx = state.stepIndex;
    const fields = bookingWizardStepFields[idx] || [];
    const errors: string[] = [];
    for (const f of fields) {
      const val = (state.details as any)[f];
      if (val == null || val === "") {
        errors.push(`Missing ${String(f)}`);
      }
    }
    return errors;
  };

  const actions: LiveBookingEngineActions = {
    goToStep: (id) => {
      const idx = state.steps.indexOf(id);
      if (idx >= 0) {
        setState({
          stepId: id,
          stepIndex: idx,
          validation: { ...state.validation, currentStepErrors: [] },
        });
      }
    },
    nextStep: async () => {
      const errs = validateCurrentStep();
      if (errs.length) {
        setState({
          validation: { ...state.validation, currentStepErrors: errs },
        });
        return;
      }
      const nextIdx = Math.min(state.stepIndex + 1, state.steps.length - 1);
      setState({
        stepIndex: nextIdx,
        stepId: state.steps[nextIdx]!,
        validation: { ...state.validation, currentStepErrors: [] },
      });
    },
    prevStep: () => {
      const prevIdx = Math.max(0, state.stepIndex - 1);
      setState({
        stepIndex: prevIdx,
        stepId: state.steps[prevIdx]!,
        validation: { ...state.validation, currentStepErrors: [] },
      });
    },
    updateField: (key, value) => {
      updateDetails({ [key]: value } as Partial<EventDetails>);
    },
    updateMany: (patch) => {
      updateDetails(patch);
    },
    loadDraft: async () => {
      setState({
        flags: { ...state.flags, loadingInitial: true },
      });
      try {
        const snap = await env.storage.loadDraft(getDraftKey());
        if (snap) {
          state = {
            ...state,
            details: { ...state.details, ...(snap.details as any) },
            booking: { ...state.booking, requestId: snap.requestId },
          };
        }
      } catch (e) {
        env.log?.("loadDraft.error", e);
      } finally {
        setState({
          flags: { ...state.flags, loadingInitial: false },
        });
      }
    },
    saveDraft: async () => {
      if (state.flags.savingDraft) return;
      setState({
        flags: { ...state.flags, savingDraft: true },
      });
      try {
        const payload = {
          artist_id: params.artistId,
          service_id: params.serviceId,
          details: state.details,
          config: params.config,
        };
        let reqId = state.booking.requestId;
        if (!reqId) {
          const created = await env.bookingApi.createDraft(payload);
          reqId = created.id;
          state.booking.requestId = reqId;
        } else {
          await env.bookingApi.updateDraft(reqId, payload);
        }
        await env.storage.saveDraft(getDraftKey(), {
          details: state.details,
          requestId: reqId ?? null,
        });
      } catch (e) {
        env.log?.("saveDraft.error", e);
      } finally {
        setState({
          flags: { ...state.flags, savingDraft: false },
        });
      }
    },
    discardDraft: async () => {
      try {
        await env.storage.clearDraft(getDraftKey());
      } catch (e) {
        env.log?.("discardDraft.error", e);
      }
      setState({
        booking: { requestId: null, status: "idle" },
        quote: { ...state.quote, isDirty: true },
      });
    },
    submitBooking: async (initialMessage) => {
      const offline = env.offline.isOffline();
      const submitFn = async () => {
        if (!state.booking.requestId) {
          await actions.saveDraft();
        }
        const rid = state.booking.requestId;
        if (!rid) return;
        setState({
          flags: { ...state.flags, submitting: true },
        });
        try {
          await env.bookingApi.submit(rid, {
            details: state.details,
            config: params.config,
          });
          if (initialMessage) {
            await env.bookingApi.postSystemMessage(rid, initialMessage);
          }
          await env.storage.clearDraft(getDraftKey());
          setState({
            booking: { requestId: rid, status: "submitted" },
            flags: { ...state.flags, submitting: false },
          });
        } catch (e) {
          env.log?.("submit.error", e);
          setState({
            flags: { ...state.flags, submitting: false },
            validation: {
              ...state.validation,
              globalError: "Failed to submit booking. Please try again.",
            },
          });
        }
      };
      if (offline) {
        env.offline.enqueue(submitFn);
        setState({ flags: { ...state.flags, offline: true } });
        return;
      }
      await submitFn();
    },
    setOffline: (isOffline) => {
      setState({
        flags: { ...state.flags, offline: isOffline },
      });
    },
  };

  // Kick off availability fetch once
  (async () => {
    try {
      setState({
        availability: { ...state.availability, status: "checking" },
      });
      const dates = await env.availability.getUnavailableDates(
        params.artistId,
      );
      setState({
        availability: {
          unavailableDates: dates,
          status: "available",
        },
      });
    } catch (e) {
      env.log?.("availability.error", e);
      setState({
        availability: {
          ...state.availability,
          status: "unknown",
        },
      });
    }
  })();

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
