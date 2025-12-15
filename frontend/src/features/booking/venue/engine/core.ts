import { BOOKING_DETAILS_PREFIX } from "@/lib/constants";
import type {
  VenueBookingEngineActions,
  VenueBookingEngineParams,
  VenueBookingEngineState,
} from "./types";

export interface VenueBookingEnv {
  now(): Date;
  bookingApi: {
    createBookingRequest(payload: any): Promise<{ id: number }>;
    postSystemMessage(
      bookingRequestId: number,
      content: string,
      opts?: { clientRequestId?: string },
    ): Promise<void>;
  };
  log?: (event: string, data?: any) => void;
}

export interface VenueBookingEngineCore {
  getState(): VenueBookingEngineState;
  subscribe(listener: (state: VenueBookingEngineState) => void): () => void;
  actions: VenueBookingEngineActions;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test((value || "").trim());
}

function isTimeHHMM(value: string): boolean {
  const raw = (value || "").trim();
  if (!raw) return false;
  const m = raw.match(/^(\d{2}):(\d{2})$/);
  if (!m) return false;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return (
    Number.isFinite(hh) &&
    Number.isFinite(mm) &&
    hh >= 0 &&
    hh <= 23 &&
    mm >= 0 &&
    mm <= 59
  );
}

function toProposedDatetime(date: string): string {
  // Use a stable time component to avoid timezone boundary surprises while
  // still preserving the user-chosen calendar date.
  return `${date}T12:00:00`;
}

function normalizeGuests(value: string): number | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
}

function buildBookingDetailsMessage(form: VenueBookingEngineState["form"]): string {
  const lines: string[] = [];
  if ((form.eventType || "").trim()) lines.push(`Event Type: ${(form.eventType || "").trim()}`);
  if (isIsoDate(form.date)) lines.push(`Date: ${form.date.trim()}`);
  const start = (form.startTime || "").trim();
  const end = (form.endTime || "").trim();
  const startOk = isTimeHHMM(start);
  const endOk = isTimeHHMM(end);
  if (startOk && endOk) lines.push(`Time: ${start}–${end}`);
  else if (startOk) lines.push(`Time: ${start}`);
  const guests = normalizeGuests(form.guests);
  if (guests != null) lines.push(`Guests: ${guests}`);
  if ((form.notes || "").trim()) lines.push(`Notes: ${(form.notes || "").trim()}`);
  return `${BOOKING_DETAILS_PREFIX}\n${lines.join("\n")}`.trim();
}

function buildVenueServiceExtras(form: VenueBookingEngineState["form"]): Record<string, unknown> {
  const date = (form.date || "").trim();
  const eventType = (form.eventType || "").trim();
  const startTime = (form.startTime || "").trim();
  const endTime = (form.endTime || "").trim();
  const guests = normalizeGuests(form.guests);
  const notes = (form.notes || "").trim();
  const venue: Record<string, unknown> = {
    v: 2,
    date,
    event_type: eventType || undefined,
    start_time: isTimeHHMM(startTime) ? startTime : undefined,
    end_time: isTimeHHMM(endTime) ? endTime : undefined,
    guests_count: guests ?? undefined,
    notes: notes || undefined,
  };
  Object.keys(venue).forEach((k) => (venue[k] === undefined ? delete venue[k] : null));
  return { venue };
}

export function createVenueBookingEngineCore(
  env: VenueBookingEnv,
  params: VenueBookingEngineParams,
): VenueBookingEngineCore {
  const initialState: VenueBookingEngineState = {
    form: { date: "", startTime: "", endTime: "", eventType: "", guests: "", notes: "" },
    booking: { status: "idle", requestId: null, error: null },
  };

  let state = initialState;
  const listeners = new Set<(s: VenueBookingEngineState) => void>();

  const notify = () => {
    listeners.forEach((l) => l(state));
  };

  const setState = (partial: Partial<VenueBookingEngineState>) => {
    state = { ...state, ...partial };
    notify();
  };

  const actions: VenueBookingEngineActions = {
    setDate(value) {
      setState({
        form: { ...state.form, date: value },
        booking: { ...state.booking, error: null },
      });
    },
    setStartTime(value) {
      setState({
        form: { ...state.form, startTime: value },
        booking: { ...state.booking, error: null },
      });
    },
    setEndTime(value) {
      setState({
        form: { ...state.form, endTime: value },
        booking: { ...state.booking, error: null },
      });
    },
    setEventType(value) {
      setState({
        form: { ...state.form, eventType: value },
        booking: { ...state.booking, error: null },
      });
    },
    setGuests(value) {
      setState({
        form: { ...state.form, guests: value },
        booking: { ...state.booking, error: null },
      });
    },
    setNotes(value) {
      setState({
        form: { ...state.form, notes: value },
        booking: { ...state.booking, error: null },
      });
    },
    reset() {
      state = initialState;
      notify();
    },
    async submit() {
      const date = (state.form.date || "").trim();
      if (!isIsoDate(date)) {
        setState({
          booking: { ...state.booking, error: "Please choose a valid date." },
        });
        return;
      }

      const eventType = (state.form.eventType || "").trim();
      if (!eventType || eventType.toLowerCase() === "other") {
        setState({
          booking: { ...state.booking, error: "Please choose an event type." },
        });
        return;
      }

      const guests = normalizeGuests(state.form.guests);
      if (guests == null) {
        setState({
          booking: {
            ...state.booking,
            error: "Please enter an estimated guest count.",
          },
        });
        return;
      }

      setState({ booking: { ...state.booking, status: "submitting", error: null } });
      try {
        const proposedDatetime = toProposedDatetime(date);
        const service_extras = buildVenueServiceExtras(state.form);
        const created = await env.bookingApi.createBookingRequest({
          service_provider_id: params.serviceProviderId,
          service_id: params.serviceId,
          proposed_datetime_1: proposedDatetime,
          service_extras,
        });

        const requestId = Number(created?.id || 0);
        if (!requestId) throw new Error("Failed to create booking request");

        const content = buildBookingDetailsMessage(state.form);
        const clientRequestId =
          typeof crypto !== "undefined" && (crypto as any).randomUUID
            ? (crypto as any).randomUUID()
            : `cid:${Date.now()}:${Math.floor(Math.random() * 1e6)}`;
        await env.bookingApi.postSystemMessage(requestId, content, {
          clientRequestId,
        });

        setState({
          booking: { status: "submitted", requestId, error: null },
        });
      } catch (e: any) {
        try {
          env.log?.("venue.submit.error", { message: e?.message });
        } catch {}
        setState({
          booking: {
            status: "idle",
            requestId: null,
            error: e?.message || "Failed to submit booking request.",
          },
        });
      }
    },
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    actions,
  };
}
