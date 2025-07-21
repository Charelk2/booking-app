import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

export interface EventDetails {
  date: Date;
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
  resetBooking: () => void;
}

const BookingContext = createContext<BookingContextValue | undefined>(undefined);

const STORAGE_KEY = 'bookingState';

const initialDetails: EventDetails = {
  date: new Date(),
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

  const resetBooking = () => {
    setStep(0);
    setDetails(initialDetails);
    setServiceId(undefined);
    setRequestId(undefined);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  // Load saved progress on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as {
        step?: number;
        details?: Partial<EventDetails> & { date?: string };
        serviceId?: number;
        requestId?: number;
      };
      const resume = window.confirm(
        'Resume your previous booking request? Choose Cancel to start over.',
      );
      if (resume) {
        if (parsed.step !== undefined) setStep(parsed.step);
        if (parsed.details) {
          const parsedDetails: EventDetails = {
            ...initialDetails,
            ...parsed.details,
            date: parsed.details.date
              ? new Date(parsed.details.date)
              : new Date(),
          };
          setDetails(parsedDetails);
        }
        if (parsed.serviceId !== undefined) setServiceId(parsed.serviceId);
        if (parsed.requestId !== undefined) setRequestId(parsed.requestId);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.error('Failed to parse saved booking progress:', e);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Persist progress
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const data = {
      step,
      details: { ...details, date: details.date.toISOString() },
      serviceId,
      requestId,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save booking progress:', e);
    }
  }, [step, details, serviceId, requestId]);
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
        resetBooking,
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
