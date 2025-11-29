import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useThrottle } from '@/hooks/useThrottle';
import { TravelResult } from '@/lib/travel';

export interface EventDetails {
  eventType: string;
  eventDescription: string;
  date: Date;
  /** Optional time string in HH:mm format */
  time?: string;
  location: string;
  /** Optional human-friendly venue/place name from autocomplete */
  locationName?: string;
  guests: string;
  venueType: 'indoor' | 'outdoor' | 'hybrid';
  sound: 'yes' | 'no';
  /** How sound will be handled when sound==='yes' */
  soundMode?: 'supplier' | 'provided_by_artist' | 'managed_by_artist' | 'client_provided' | 'none';
  /** Optional selection of a preferred sound supplier service ID */
  soundSupplierServiceId?: number;
  /** Additional sound context toggles used in Sound step and review */
  stageRequired?: boolean;
  stageSize?: 'S' | 'M' | 'L';
  lightingEvening?: boolean;
  /** If evening lighting applies, allow client to upgrade to Advanced (adds Advanced−Basic) */
  lightingUpgradeAdvanced?: boolean;
  backlineRequired?: boolean;
  /** Estimated price when provided_by_artist path is selected */
  providedSoundEstimate?: number;
  notes?: string;
  attachment_url?: string;
}

// Persisted/saved details differ from EventDetails: date is stored as ISO string or null
type SavedDetails = Partial<Omit<EventDetails, 'date'>> & { date?: string | null; time?: string };

type SavedState = {
  step?: number;
  details?: SavedDetails;
  serviceId?: number;
  requestId?: number;
  travelResult?: TravelResult | null;
};

interface BookingContextValue {
  step: number;
  setStep: (s: number) => void;
  details: EventDetails;
  setDetails: (d: EventDetails) => void;
  serviceId?: number;
  setServiceId: (id: number | undefined) => void;
  requestId?: number;
  setRequestId: (id: number | undefined) => void;
  travelResult: TravelResult | null;
  setTravelResult: (r: TravelResult | null) => void;
  resetBooking: () => void;
  loadSavedProgress: () => boolean;
  peekSavedProgress: () => SavedState | null;
  applySavedProgress: (parsed: SavedState) => void;
}

const BookingContext = createContext<BookingContextValue | undefined>(undefined);

const STORAGE_KEY = 'bookingState';

export const initialDetails: EventDetails = {
  eventType: '',
  eventDescription: '',
  date: new Date(),
  time: '',
  location: '',
  locationName: '',
  guests: '',
  venueType: 'indoor',
  sound: 'yes',
  soundMode: 'supplier',
  soundSupplierServiceId: undefined,
  stageRequired: false,
  stageSize: undefined,
  lightingEvening: false,
  lightingUpgradeAdvanced: false,
  backlineRequired: false,
  attachment_url: '',
};

export const BookingProvider = ({ children }: { children: ReactNode }) => {
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState<EventDetails>(initialDetails);
  const [serviceId, setServiceId] = useState<number | undefined>(undefined);
  const [requestId, setRequestId] = useState<number | undefined>(undefined);
  const [travelResult, setTravelResult] = useState<TravelResult | null>(null);

  const resetBooking = () => {
    setStep(0);
    setDetails(initialDetails);
    setServiceId(undefined);
    setRequestId(undefined);
    setTravelResult(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  // Determine whether saved data is meaningful (user actually started)
  const hasMeaningfulProgress = (p: SavedState) => {
    if (!p) return false;
    const stepNum = p.step ?? 0;
    if (stepNum > 0) return true;
    const d = p.details || {};
    const nonempty = (v?: string | null) => !!(v && String(v).trim());
    return (
      nonempty(d.eventDescription) ||
      nonempty(d.location) ||
      nonempty(d.guests) ||
      nonempty(d.eventType) ||
      // Treat date as meaningful progress only when the user is on or past the
      // Date step; avoid persisting a brand‑new wizard with just today's date.
      (stepNum >= 2 && d.date != null && String(d.date).trim() !== '')
    );
  };

  const peekSavedProgress = () => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored) as SavedState;
      if (!hasMeaningfulProgress(parsed)) return null;
      return parsed;
    } catch (e) {
      console.error('Failed to parse saved booking progress:', e);
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  };

  const applySavedProgress = (parsed: SavedState) => {
    if (parsed.step !== undefined) setStep(parsed.step);
    if (parsed.details) {
      const parsedDetails: EventDetails = {
        ...initialDetails,
        ...parsed.details,
        date: parsed.details.date ? new Date(parsed.details.date) : new Date(),
      };
      setDetails(parsedDetails);
    }
    if (parsed.serviceId !== undefined) setServiceId(parsed.serviceId);
    if (parsed.requestId !== undefined) setRequestId(parsed.requestId);
    if (parsed.travelResult) setTravelResult(parsed.travelResult);
  };

  // Legacy: keep API but do not auto-confirm; only restore if there is meaningful progress
  const loadSavedProgress = () => {
    const parsed = peekSavedProgress();
    if (!parsed) return false;
    applySavedProgress(parsed);
    return true;
  };

  // Persist progress with throttling to avoid excessive localStorage writes
  const throttledState = useThrottle(
    { step, details, serviceId, requestId, travelResult },
    1000,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Build a SavedState object for persistence (date as string|null)
    const { date: _date, ...restDetails } = throttledState.details;
    const data: SavedState = {
      step: throttledState.step,
      details: {
        ...restDetails,
        // Guard against undefined or invalid dates when persisting progress
        date: throttledState.details.date
          ? new Date(throttledState.details.date).toISOString()
          : null,
      },
      serviceId: throttledState.serviceId,
      requestId: throttledState.requestId,
      travelResult: throttledState.travelResult,
    };
    try {
      // Only persist if there is meaningful progress
      if (hasMeaningfulProgress(data)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    } catch (e) {
      console.error('Failed to save booking progress:', e);
    }
  }, [throttledState]);
  return (
    <BookingContext.Provider
      value={{
        step,
        setStep,
        details,
        setDetails,
        serviceId,
        setServiceId,
      requestId,
      setRequestId,
      travelResult,
      setTravelResult,
      resetBooking,
      loadSavedProgress,
      peekSavedProgress,
      applySavedProgress,
    }}
    >
      {children}
    </BookingContext.Provider>
  );
};

export const useBooking = () => {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBooking must be used within BookingProvider');
  return ctx;
};
