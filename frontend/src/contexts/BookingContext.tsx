import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { TravelResult } from '@/lib/travel';

export interface EventDetails {
  eventType: string;
  eventDescription: string;
  date: Date;
  /** Optional time string in HH:mm format */
  time?: string;
  location: string;
  guests: string;
  venueType: 'indoor' | 'outdoor' | 'hybrid';
  sound: 'yes' | 'no';
  notes?: string;
  attachment_url?: string;
}

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
}

const BookingContext = createContext<BookingContextValue | undefined>(undefined);

const STORAGE_KEY = 'bookingState';

const initialDetails: EventDetails = {
  eventType: '',
  eventDescription: '',
  date: new Date(),
  time: '',
  location: '',
  guests: '',
  venueType: 'indoor',
  sound: 'yes',
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

  /**
   * Restore an in-progress booking from localStorage if the user confirms.
   * Returns true when progress was restored.
   */
  const loadSavedProgress = () => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;
    try {
      const parsed = JSON.parse(stored) as {
        step?: number;
        details?: Partial<EventDetails> & { date?: string; time?: string };
        serviceId?: number;
        requestId?: number;
        travelResult?: TravelResult | null;
      };

      const resume = window.confirm(
        'Resume your previous booking request? Choose Cancel to start over.',
      );
      if (!resume) {
        localStorage.removeItem(STORAGE_KEY);
        return false;
      }

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

      return true;
    } catch (e) {
      console.error('Failed to parse saved booking progress:', e);
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
  };

  // Persist progress
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const data = {
      step,
        details: {
          ...details,
          // Guard against undefined or invalid dates when persisting progress
          date: details.date ? new Date(details.date).toISOString() : null,
        },
      serviceId,
      requestId,
      travelResult,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save booking progress:', e);
    }
  }, [step, details, serviceId, requestId, travelResult]);
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
