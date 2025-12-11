// frontend/src/features/booking/personalizedVideo/engine/types.ts
// Headless engine contracts for Personalized Video orders.
// These types describe the state and actions that any UI (web, React Native)
// can consume, without pulling in React or browser-specific APIs.

export type PersonalizedVideoStepId = 'draft' | 'payment' | 'brief';

// Mirrors the fields collected in the draft sheet.
export interface VideoOrderDraft {
  deliveryBy: string; // ISO date (yyyy-MM-dd) or empty string
  lengthChoice: '30_45' | '60_90';
  language: 'EN' | 'AF';
  recipient: string;
  promo: string;
}

export interface VideoOrderSummary {
  id: number;
  artistId: number;
  buyerId: number;
  status:
    | 'draft'
    | 'awaiting_payment'
    | 'paid'
    | 'info_pending'
    | 'in_production'
    | 'delivered'
    | 'closed';
  deliveryByUtc: string;
  lengthSec: number;
  language: string;
  total: number;
  priceBase: number;
  priceRush: number;
  priceAddons: number;
  discount: number;
}

export type BriefAnswers = Record<string, any>;

export interface PersonalizedVideoEngineState {
  stepId: PersonalizedVideoStepId;

  // Draft step
  draft: VideoOrderDraft;
  unavailableDates: string[]; // yyyy-MM-dd[]
  availabilityStatus: 'idle' | 'checking' | 'available' | 'unavailable' | 'unknown';
  status: {
    checking: boolean;
    available: boolean | null;
    canContinue: boolean;
    disabledReason: string | null;
  };
  pricing: {
    basePriceZar: number;
    rushFee: number;
    addOnLongZar: number;
    priceAddOn: number;
    discount: number;
    total: number;
    lengthSec: number;
  };

  // Order identity + payment
  orderId: number | null;
  orderSummary: VideoOrderSummary | null;
  payment: {
    loading: boolean;
    error: string | null;
    canPay: boolean;
  };

  // Brief step
  brief: {
    answers: BriefAnswers;
    progress: { answered: number; total: number };
    saveState: 'idle' | 'saving' | 'saved' | 'error';
  };

  // Flags
  flags: {
    creatingDraft: boolean;
    hasSavedDraft: boolean;
    loadingFromStorage: boolean;
  };
}

export interface PersonalizedVideoEngineActions {
  // Navigation
  goToStep: (id: PersonalizedVideoStepId) => void;

  // Draft updates
  updateDraftField: <K extends keyof VideoOrderDraft>(
    key: K,
    value: VideoOrderDraft[K],
  ) => void;
  recalcPricing: () => void;
  checkAvailability: () => Promise<void>;

  // Draft lifecycle
  createOrUpdateDraft: () => Promise<void>;
  loadDraftFromStorage: () => Promise<void>;
  discardDraft: () => Promise<void>;

  // Payment
  reloadOrderSummary: () => Promise<void>;
  startPayment: () => Promise<void>;
  markPaid: (reference?: string) => Promise<void>;

  // Brief
  updateAnswer: (key: string, value: any, opts?: { immediate?: boolean }) => void;
  flushAnswers: () => Promise<void>;
  submitBrief: () => Promise<void>;
}

export interface PersonalizedVideoEngine {
  state: PersonalizedVideoEngineState;
  actions: PersonalizedVideoEngineActions;
}

export interface PersonalizedVideoEngineParams {
  artistId: number;
  serviceId?: number;
  basePriceZar: number;
  addOnLongZar: number;
  orderId?: number;
  threadId?: number;
  onDraftCreated?: (orderId: number, isDemo: boolean) => void;
}
