import { initialDetails } from "@/contexts/BookingContext";
import type { EventDetails } from "@/contexts/BookingContext";
import type { TravelResult } from "@/lib/travel";
import {
  type LiveBookingEngine,
  type LiveBookingEngineActions,
  type LiveBookingEngineParams,
  type LiveBookingEngineState,
  type LiveBookingStepId,
} from "./types";
import { bookingWizardStepFields } from "@/lib/shared/validation/booking";
import { computeFallbackSoundCost } from "./soundFallback";

export interface LiveEnv {
  now(): Date;
  availability: {
    getUnavailableDates(artistId: number): Promise<string[]>;
  };
  service: {
    getService(serviceId: number): Promise<any | null>;
    getRiderSpec(serviceId: number): Promise<any | null>;
  };
  travel: {
    getDistanceKm(origin: string, destination: string): Promise<number | null>;
  };
  sound: {
    pricebookEstimate(
      serviceId: number,
      payload: any,
    ): Promise<{
      estimate_min: number | null;
      estimate_max: number | null;
      pricebook_missing?: boolean;
    }>;
    calculateEstimate(
      serviceId: number,
      payload: any,
    ): Promise<{ total?: number | null } | null>;
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
    ): Promise<{ details: EventDetails; requestId: number | null; travelResult?: TravelResult | null } | null>;
    saveDraft(
      key: string,
      snapshot: { details: EventDetails; requestId: number | null; travelResult?: TravelResult | null },
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
  const normalizeRiderForPricing = (spec: any): {
    units: Record<string, number>;
    backline: Record<string, number>;
  } => {
    const units = {
      vocal_mics: 0,
      speech_mics: 0,
      monitor_mixes: 0,
      iem_packs: 0,
      di_boxes: 0,
    } as Record<string, number>;
    const backline: Record<string, number> = {};
    if (!spec || typeof spec !== "object") return { units, backline };
    try {
      if (spec.monitors != null) units.monitor_mixes = Number(spec.monitors) || 0;
      if (spec.di != null) units.di_boxes = Number(spec.di) || 0;
      if (spec.wireless != null) units.speech_mics = Number(spec.wireless) || 0;
      if (spec.mics && typeof spec.mics === "object") {
        const dyn = Number(spec.mics.dynamic || 0);
        const cond = Number(spec.mics.condenser || 0);
        units.vocal_mics = Math.max(units.vocal_mics, dyn + cond);
      }
      if (spec.iem_packs != null) units.iem_packs = Number(spec.iem_packs) || 0;
      if (
        spec.monitoring &&
        typeof spec.monitoring === "object" &&
        spec.monitoring.iem_packs != null
      ) {
        units.iem_packs = Math.max(
          units.iem_packs,
          Number(spec.monitoring.iem_packs) || 0,
        );
      }
      const arr: any[] = Array.isArray(spec.backline) ? spec.backline : [];
      const mapKey = (name: string): string | null => {
        const n = String(name || "").toLowerCase();
        if (n.includes("drum") && n.includes("full")) return "drums_full";
        if (n.includes("drum")) return "drum_shells";
        if (n.includes("guitar") && n.includes("amp")) return "guitar_amp";
        if (n.includes("bass") && n.includes("amp")) return "bass_amp";
        if (n.includes("keyboard") && n.includes("amp")) return "keyboard_amp";
        if (n.includes("keyboard") && n.includes("stand")) return "keyboard_stand";
        if (n.includes("digital") && n.includes("piano")) return "piano_digital_88";
        if (n.includes("upright") && n.includes("piano")) return "piano_acoustic_upright";
        if (n.includes("grand") && n.includes("piano")) return "piano_acoustic_grand";
        if (n.includes("dj") && (n.includes("booth") || n.includes("table")))
          return "dj_booth";
        return null;
      };
      for (const item of arr) {
        const src = typeof item === "string" ? item : item?.name || "";
        const k = mapKey(src);
        if (!k) continue;
        backline[k] = (backline[k] || 0) + 1;
      }
    } catch {
      // noop
    }
    return { units, backline };
  };

  let state: LiveBookingEngineState = {
    stepId: defaultSteps[0]!,
    stepIndex: 0,
    steps: defaultSteps,
    details: { ...initialDetails },
    availability: {
      unavailableDates: [],
      status: "idle",
    },
    travelResult: null,
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
      quoteLoading: false,
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

  const buildPayload = (status: "draft" | "pending_quote") => {
    const d = state.details as any;
    const toIso = (value: any) => (value ? new Date(value).toISOString() : undefined);
    const toNumber = (value: any) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : undefined;
    };
    const travel = state.travelResult as TravelResult | null;
    const travelBreakdown = {
      ...(travel?.breakdown || {}),
      distance_km: toNumber((travel as any)?.distanceKm),
      mode: (travel as any)?.mode,
      supplier_distance_km: toNumber((state.quote as any)?.supplierDistanceKm),
      venue_name: d?.locationName,
      venue_type: d?.venueType,
      event_type: d?.eventType,
      guests_count: toNumber(d?.guests),
      sound_required: d?.sound === "yes",
      sound_mode: d?.soundMode,
      selected_sound_service_id: d?.soundSupplierServiceId,
      event_city: d?.location,
      stage_required: !!d?.stageRequired,
      stage_size: d?.stageRequired ? d?.stageSize || "S" : undefined,
      lighting_evening: !!d?.lightingEvening,
      upgrade_lighting_advanced: !!d?.lightingUpgradeAdvanced,
      backline_required: !!d?.backlineRequired,
      provided_sound_estimate: toNumber(d?.providedSoundEstimate),
    };
    const soundContext = {
      sound_required: d?.sound === "yes",
      mode: d?.soundMode || "none",
      guest_count: toNumber(d?.guests),
      venue_type: d?.venueType,
      stage_required: !!d?.stageRequired,
      stage_size: d?.stageRequired ? d?.stageSize || "S" : undefined,
      lighting_evening: !!d?.lightingEvening,
      backline_required: !!d?.backlineRequired,
      selected_sound_service_id: d?.soundSupplierServiceId,
    };
    return {
      artist_id: params.artistId,
      service_id: params.serviceId,
      status,
      proposed_datetime_1: toIso(d?.date),
      message: d?.notes,
      attachment_url: d?.attachment_url,
      details: state.details,
      config: params.config,
      travel_breakdown: travelBreakdown,
      sound_context: soundContext,
      rider_units: (state.quote as any)?.riderUnits,
      backline_requested: (state.quote as any)?.backlineRequested,
      service_provider_id: 0,
      travel_mode: travel?.mode,
      travel_cost: toNumber((travel as any)?.totalCost),
    };
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
            travelResult: snap.travelResult ?? state.travelResult,
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
        const payload = buildPayload("draft");
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
          travelResult: state.travelResult,
        });
        setState({
          validation: { ...state.validation, globalError: null },
        });
      } catch (e) {
        env.log?.("saveDraft.error", e);
        setState({
          validation: {
            ...state.validation,
            globalError: "Failed to save draft. Please try again.",
          },
        });
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
          const payload = buildPayload("pending_quote");
          await env.bookingApi.submit(rid, payload);
          if (initialMessage) {
            await env.bookingApi.postSystemMessage(rid, initialMessage);
          }
          await env.storage.clearDraft(getDraftKey());
          setState({
            booking: { requestId: rid, status: "submitted" },
            flags: { ...state.flags, submitting: false },
            validation: { ...state.validation, globalError: null },
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
    setTravelResult: (travel) => {
      setState({
        travelResult: travel,
        quote: { ...state.quote, isDirty: true },
      });
    },
    recalculateQuote: async () => {
      if (!state.quote.isDirty || state.flags.quoteLoading) return;
      setState({
        flags: { ...state.flags, quoteLoading: true },
      });
      try {
        const d = state.details as any;
        const travel = state.travelResult as any;
        const normalizeGuests = () => {
          const n = Number(d?.guests);
          return Number.isFinite(n) ? n : undefined;
        };
        if (!params.serviceId || !d?.location) {
          setState({
            flags: { ...state.flags, quoteLoading: false },
          });
          return;
        }

        let supplierDistanceKm: number | undefined;
        let riderUnits: Record<string, number> | undefined;
        let backlineRequested: Record<string, number> | undefined;
        let supplierService: any | null = null;

        try {
          const riderSpec = await env.service.getRiderSpec(params.serviceId);
          if (riderSpec) {
            const norm = normalizeRiderForPricing(riderSpec);
            riderUnits = norm.units;
            backlineRequested = d?.backlineRequired ? norm.backline : undefined;
          }
        } catch (e) {
          env.log?.("rider.error", e);
        }

        try {
          const supplierId = d?.soundSupplierServiceId as number | undefined;
          if (supplierId && d?.location) {
            const svc = await env.service.getService(supplierId);
            supplierService = svc;
            const baseLoc = svc?.details?.base_location as string | undefined;
            if (baseLoc) {
              const dist = await env.travel.getDistanceKm(baseLoc, d.location);
              if (typeof dist === "number" && Number.isFinite(dist)) {
                supplierDistanceKm = dist * 2; // round-trip
              }
            }
          }
        } catch (e) {
          env.log?.("supplier.distance.error", e);
        }

        const payload: any = {
          base_fee: params.config.basePriceZar || 0,
          distance_km: Number(travel?.distanceKm || 0),
          service_id: params.serviceId,
          event_city: d?.location,
          sound_required: d?.sound === "yes",
          sound_mode: d?.soundMode,
          guest_count: normalizeGuests(),
          venue_type: d?.venueType,
          stage_required: !!d?.stageRequired,
          stage_size: d?.stageRequired ? d?.stageSize || "S" : undefined,
          lighting_evening: !!d?.lightingEvening,
          backline_required: !!d?.backlineRequired,
          upgrade_lighting_advanced: !!d?.lightingUpgradeAdvanced,
          selected_sound_service_id: d?.soundSupplierServiceId,
          supplier_distance_km: supplierDistanceKm,
          rider_units: riderUnits,
          backline_requested: backlineRequested,
          travel_rate: params.config.travelRate,
          travel_members: params.config.travelMembers,
        };
        const res = await env.quoteApi.estimateQuote(payload);
        const resSoundCost = Number((res as any)?.sound_cost);
        const hasServerSoundCost =
          Number.isFinite(resSoundCost) && resSoundCost > 0;
        let soundCost: number | null = hasServerSoundCost ? resSoundCost : null;

        try {
          const soundModePref = String(d?.soundMode || "").toLowerCase();
          const provisioningMode = String(
            (params.config?.soundProvisioning as any)?.mode || "",
          ).toLowerCase();
          const supplierId = d?.soundSupplierServiceId as number | undefined;
          const shouldUseSupplier =
            soundModePref === "supplier" ||
            soundModePref === "external_providers" ||
            provisioningMode === "external_providers";
          const needsFallback =
            (!soundCost || soundCost <= 0) &&
            d?.sound === "yes" &&
            supplierId &&
            shouldUseSupplier;

          if (needsFallback) {
            const fallback = await computeFallbackSoundCost(
              {
                serviceId: params.serviceId,
                supplierServiceId: supplierId,
                supplierService,
                eventCity: d?.location,
                guestCount: normalizeGuests(),
                venueType: d?.venueType,
                stageRequired: !!d?.stageRequired,
                stageSize: d?.stageRequired ? d?.stageSize || "S" : undefined,
                lightingEvening: !!d?.lightingEvening,
                lightingUpgradeAdvanced: !!d?.lightingUpgradeAdvanced,
                backlineRequired: !!d?.backlineRequired,
                riderUnits,
                backlineRequested,
                distanceKm: supplierDistanceKm,
              },
              {
                loadService: env.service.getService,
                pricebookEstimate: env.sound?.pricebookEstimate,
                calculateEstimate: env.sound?.calculateEstimate,
                log: env.log,
              },
            );
            if (
              typeof fallback === "number" &&
              Number.isFinite(fallback) &&
              fallback > 0
            ) {
              soundCost = fallback;
            }
          }
        } catch (e) {
          env.log?.("sound.fallback.error", e);
        }
        setState({
          quote: {
            items: (res as any)?.items ?? [],
            total: (res as any)?.total ?? null,
            travel: (res as any)?.travel_estimates ?? null,
            soundCost: soundCost ?? null,
            supplierDistanceKm: supplierDistanceKm ?? null,
            riderUnits,
            backlineRequested,
            isDirty: false,
          },
          flags: { ...state.flags, quoteLoading: false },
          validation: { ...state.validation, globalError: null },
        });
      } catch (e) {
        env.log?.("quote.error", e);
        setState({
          flags: { ...state.flags, quoteLoading: false },
          validation: {
            ...state.validation,
            globalError:
              "Failed to refresh quote. Please check your details and try again.",
          },
        });
      }
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
