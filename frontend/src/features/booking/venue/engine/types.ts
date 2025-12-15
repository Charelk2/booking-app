export type VenueBookingEngineParams = {
  serviceProviderId: number;
  serviceId: number;
};

export type VenueBookingStatus = "idle" | "submitting" | "submitted";

export type VenueBookingEngineState = {
  form: {
    date: string;
    guests: string;
    notes: string;
  };
  booking: {
    status: VenueBookingStatus;
    requestId: number | null;
    error: string | null;
  };
};

export type VenueBookingEngineActions = {
  setDate(value: string): void;
  setGuests(value: string): void;
  setNotes(value: string): void;
  reset(): void;
  submit(): Promise<void>;
};

export type VenueBookingEngine = {
  state: VenueBookingEngineState;
  actions: VenueBookingEngineActions;
};

