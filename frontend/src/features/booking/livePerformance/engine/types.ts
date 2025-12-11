import type { EventDetails } from "@/contexts/BookingContext";
import type { TravelResult } from "@/lib/travel";

export type LiveBookingStepId =
  | "description"
  | "location"
  | "dateTime"
  | "eventType"
  | "guests"
  | "venue"
  | "sound"
  | "notes"
  | "review";

export interface LiveBookingEngineState {
  stepId: LiveBookingStepId;
  stepIndex: number;
  steps: LiveBookingStepId[];

  details: EventDetails;
  travelResult: TravelResult | null;

  availability: {
    unavailableDates: string[];
    status: "idle" | "checking" | "available" | "unavailable" | "unknown";
  };

  quote: {
    items: any[];
    total: number | null;
    travel: any | null;
    soundCost: number | null;
    supplierDistanceKm?: number | null;
    riderUnits?: Record<string, number> | undefined;
    backlineRequested?: Record<string, number> | undefined;
    isDirty: boolean;
  };

  booking: {
    requestId: number | null;
    status: "idle" | "draft" | "submitted";
  };

  flags: {
    loadingInitial: boolean;
    savingDraft: boolean;
    submitting: boolean;
    offline: boolean;
    quoteLoading: boolean;
  };

  validation: {
    currentStepErrors: string[];
    globalError: string | null;
  };
}

export interface LiveBookingEngineActions {
  goToStep: (id: LiveBookingStepId) => void;
  nextStep: () => Promise<void>;
  prevStep: () => void;
  updateField: <K extends keyof EventDetails>(
    key: K,
    value: EventDetails[K],
  ) => void;
  updateMany: (patch: Partial<EventDetails>) => void;
  loadDraft: () => Promise<void>;
  saveDraft: () => Promise<void>;
  discardDraft: () => Promise<void>;
  submitBooking: (initialMessage?: string) => Promise<void>;
  setOffline: (isOffline: boolean) => void;
  setTravelResult: (travel: TravelResult | null) => void;
  recalculateQuote: () => Promise<void>;
}

export interface LiveServiceConfig {
  basePriceZar: number;
  durationMinutes: number;
  soundProvisioning: Record<string, any>;
  travelRate?: number;
  travelMembers?: number;
}

export interface LiveBookingEngineParams {
  artistId: number;
  serviceId: number;
  config: LiveServiceConfig;
}

export interface LiveBookingEngine {
  state: LiveBookingEngineState;
  actions: LiveBookingEngineActions;
}
