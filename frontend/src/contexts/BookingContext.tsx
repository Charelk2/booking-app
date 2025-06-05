import { createContext, useContext, useState, ReactNode } from 'react';

export interface EventDetails {
  date: Date;
  time: string;
  location: string;
  guests: number;
  venueType: 'indoor' | 'outdoor' | 'hybrid';
  notes?: string;
}

interface BookingContextValue {
  step: number;
  setStep: (s: number) => void;
  details: EventDetails;
  setDetails: (d: EventDetails) => void;
  requestId?: number;
  setRequestId: (id: number | undefined) => void;
}

const BookingContext = createContext<BookingContextValue | undefined>(undefined);

export const BookingProvider = ({ children }: { children: ReactNode }) => {
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState<EventDetails>({
    date: new Date(),
    time: '',
    location: '',
    guests: 1,
    venueType: 'indoor',
  });
  const [requestId, setRequestId] = useState<number | undefined>(undefined);
  return (
    <BookingContext.Provider value={{ step, setStep, details, setDetails, requestId, setRequestId }}>
      {children}
    </BookingContext.Provider>
  );
};

export const useBooking = () => {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBooking must be used within BookingProvider');
  return ctx;
};
