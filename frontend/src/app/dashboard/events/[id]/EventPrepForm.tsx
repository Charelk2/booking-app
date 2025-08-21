"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
} from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  CalendarDays,
  MapPin,
  ReceiptText,
  CheckCircle2,
  Loader2,
  Music4,
  UploadCloud,
  Trash2,
  AlertTriangle,
  Clock,
  Mic2,
  Users,
  GitCommitHorizontal,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import SavedPill from "@/components/ui/SavedPill";
import useSavedHint from "@/hooks/useSavedHint";
import type { EventPrep, Booking, EventPrepAttachment } from "@/types";
import {
  getEventPrep,
  updateEventPrep,
  getBookingDetails,
  getRider,
  uploadBookingAttachment,
  getEventPrepAttachments,
  addEventPrepAttachment,
  deleteEventPrepAttachment,
} from "@/lib/api";

/* ────────────────────────────────────────────────────────────────────────────
   Utilities
   ────────────────────────────────────────────────────────────────────────── */
const toHHMM = (v?: string | null) => (v ? String(v).slice(0, 5) : "");
const ZAR = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));

const timeToMinutes = (val?: string | null): number => {
  if (!val) return NaN;
  const s = String(val).trim();
  const parts = s.split(":");
  if (parts.length < 2) return NaN;
  const h = Number(parts[0]);
  const min = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return NaN;
  if (h < 0 || h > 23 || min < 0 || min > 59) return NaN;
  return h * 60 + min;
};

// Small helper for "(1h 30m)" style durations
const formatDuration = (startMinutes: number, endMinutes: number): string | null => {
  if (isNaN(startMinutes) || isNaN(endMinutes) || endMinutes <= startMinutes) return null;
  const duration = endMinutes - startMinutes;
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  let result = "";
  if (hours > 0) result += `${hours}h`;
  if (minutes > 0) result += ` ${minutes}m`;
  return result.trim();
};

// Local persistence for critical time fields
const TIME_FIELDS: (keyof EventPrep | "soundcheck_end_time")[] = [
  "loadin_start",
  "loadin_end",
  "soundcheck_time",
  "guests_arrival_time",
  "performance_start_time",
  "performance_end_time",
  "soundcheck_end_time",
];
const localTimesKey = (bookingId: number) => `event_prep_times:${bookingId}`;

function readLocalTimes(bookingId: number): Partial<EventPrep & { soundcheck_end_time: string }> {
  try {
    const raw = localStorage.getItem(localTimesKey(bookingId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function writeLocalTimes(bookingId: number, data: Partial<EventPrep & { soundcheck_end_time: string }>) {
  try {
    const current = readLocalTimes(bookingId);
    const next = { ...current };
    for (const k of TIME_FIELDS) {
      if (k in data) (next as any)[k] = (data as any)[k];
    }
    localStorage.setItem(localTimesKey(bookingId), JSON.stringify(next));
  } catch {
    // ignore
  }
}

// Encode soundcheck end into schedule_notes so it survives cross-device
const SND_TAG = "SND_END";
function parseSoundcheckEndFromNotes(notes: string): string | null {
  try {
    const m = notes.match(new RegExp(`\\[${SND_TAG}=([0-2]?\\d:[0-5]\\d)(?::[0-5]\\d)?\\]`));
    return m?.[1] || null;
  } catch {
    return null;
  }
}
function composeSoundcheckEndIntoNotes(notes: string, endHHMM: string): string {
  const base = (notes || "").replace(new RegExp(`\\[${SND_TAG}=[^\\]]*\\]`), "").trim();
  if (!endHHMM) return base;
  const tag = `[${SND_TAG}=${endHHMM}]`;
  return base ? `${base}\n${tag}` : tag;
}

/* ────────────────────────────────────────────────────────────────────────────
   Data hook (stable hooks, no conditional creation)
   ────────────────────────────────────────────────────────────────────────── */
function useEventPrep(bookingId: number) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [ep, setEp] = useState<EventPrep | null>(null);
  const [riderUrl, setRiderUrl] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<EventPrepAttachment[]>([]);
  const [soundcheckEnd, setSoundcheckEnd] = useState<string>("");

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { saving, saved, startSaving, doneSaving, stopSaving } = useSavedHint();
  const pendingPatchRef = useRef<Partial<EventPrep>>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [b, e] = await Promise.all([
          getBookingDetails(bookingId).then((r) => r.data),
          getEventPrep(bookingId),
        ]);
        if (!mounted) return;

        setBooking(b);

        const localTimes = readLocalTimes(bookingId);
        const merged: EventPrep = { ...(e as EventPrep) };
        let needsServerUpdate = false;

        Object.keys(localTimes).forEach((key) => {
          const k = key as keyof typeof localTimes;
          if (!(merged as any)[k] && (localTimes as any)[k]) {
            (merged as any)[k] = (localTimes as any)[k];
            needsServerUpdate = true;
          }
        });

        setEp(merged);

        const scEndLocal =
          localTimes.soundcheck_end_time || parseSoundcheckEndFromNotes(merged.schedule_notes || "") || "";
        setSoundcheckEnd(toHHMM(scEndLocal));

        if (needsServerUpdate) {
          updateEventPrep(bookingId, merged).catch(() => {});
        }

        getEventPrepAttachments(bookingId)
          .then(({ data }) => mounted && setAttachments(data || []))
          .catch(() => mounted && setAttachments([]));

        if (b?.service?.id) {
          getRider(b.service.id)
            .then((r) => mounted && setRiderUrl(r.data?.pdf_url || null))
            .catch(() => mounted && setRiderUrl(null));
        }
      } catch (err) {
        console.error("Failed to load event prep:", err);
      }
    })();

    return () => {
      mounted = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [bookingId]);

  const patch = useCallback(
    (p: Partial<EventPrep>) => {
      setEp((prev) => ({ ...(prev as EventPrep), ...p }));
      startSaving();
      writeLocalTimes(bookingId, p);

      if (saveTimer.current) clearTimeout(saveTimer.current);
      pendingPatchRef.current = { ...pendingPatchRef.current, ...p };

      saveTimer.current = setTimeout(async () => {
        const payload = pendingPatchRef.current;
        pendingPatchRef.current = {};
        if (!payload || Object.keys(payload).length === 0) {
          stopSaving();
          return;
        }
        try {
          const fresh = await updateEventPrep(bookingId, payload as any);
          setEp((prev) => ({ ...(prev as EventPrep), ...(fresh as EventPrep) }));
          doneSaving();
        } catch (err) {
          console.error("Save failed:", err);
          stopSaving();
        }
      }, 800);
    },
    [bookingId, startSaving, doneSaving, stopSaving]
  );

  const uploadAttachment = useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const { data: up } = await uploadBookingAttachment(formData);
      if (up?.url) {
        const { data: created } = await addEventPrepAttachment(bookingId, up.url);
        setAttachments((prev) => [...prev, created]);
      }
    },
    [bookingId]
  );

  const deleteAttachment = useCallback(
    async (id: number) => {
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      try {
        await deleteEventPrepAttachment(bookingId, id);
      } catch (err) {
        console.error("Failed to delete attachment:", err);
      }
    },
    [bookingId]
  );

  return {
    booking,
    ep,
    riderUrl,
    attachments,
    saving,
    saved,
    patch,
    uploadAttachment,
    deleteAttachment,
    soundcheckEnd,
    setSoundcheckEnd,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   UI Primitives
   ────────────────────────────────────────────────────────────────────────── */
function Section({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
        <div>
          <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
      {subtitle && <p className="px-5 pt-2 text-[12px] text-gray-500">{subtitle}</p>}
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  children,
  disabled = false,
  tooltip,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  tooltip?: string;
}) {
  return (
    <div title={disabled ? tooltip : undefined}>
      <label htmlFor={id} className="block text-[12.5px] font-medium text-gray-600">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      {...rest}
      className={
        `w-full rounded-lg border bg-white px-3.5 py-2 text-sm shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:border-dashed disabled:bg-gray-100 disabled:text-gray-500 ${
          props.disabled ? "border-gray-200" : "border-gray-300"
        } ` + (className || "")
      }
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return (
    <textarea
      {...rest}
      className={
        `w-full resize-y rounded-lg border bg-white px-3.5 py-2 text-sm shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:border-dashed disabled:bg-gray-100 disabled:text-gray-500 ${
          props.disabled ? "border-gray-200" : "border-gray-300"
        } ` + (className || "")
      }
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Timeline prefs (ONLY expand/collapse)
   ────────────────────────────────────────────────────────────────────────── */
function useTimelinePrefs(bookingId: number) {
  const key = `event_prep_timeline_prefs:${bookingId}`;
  const [expanded, setExpanded] = useState<boolean>(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const obj = JSON.parse(raw);
        if (typeof obj.expanded === "boolean") setExpanded(obj.expanded);
      }
    } catch {
      // ignore
    }
  }, [key]);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ expanded }));
    } catch {
      // ignore
    }
  }, [key, expanded]);

  return { expanded, setExpanded };
}

/* ────────────────────────────────────────────────────────────────────────────
   Vertical Timeline (your design)
   ────────────────────────────────────────────────────────────────────────── */
function VerticalTimeline({
  ep,
  soundcheckEnd,
  issues,
}: {
  ep: EventPrep;
  soundcheckEnd: string;
  issues: string[];
}) {
  const events = useMemo(() => {
    const rows = [
      {
        key: "loadin",
        label: "Load-in",
        startMin: timeToMinutes(ep.loadin_start),
        endMin: timeToMinutes(ep.loadin_end),
        startStr: toHHMM(ep.loadin_start),
        endStr: toHHMM(ep.loadin_end),
        icon: GitCommitHorizontal,
        color: "text-sky-600",
      },
      {
        key: "soundcheck",
        label: "Soundcheck",
        startMin: timeToMinutes(ep.soundcheck_time),
        endMin: timeToMinutes(soundcheckEnd),
        startStr: toHHMM(ep.soundcheck_time),
        endStr: toHHMM(soundcheckEnd),
        icon: Mic2,
        color: "text-indigo-600",
      },
      {
        key: "guests",
        label: "Guests Arrive",
        startMin: timeToMinutes(ep.guests_arrival_time),
        endMin: NaN,
        startStr: toHHMM(ep.guests_arrival_time),
        endStr: "",
        icon: Users,
        color: "text-pink-600",
      },
      {
        key: "performance",
        label: "Performance",
        startMin: timeToMinutes(ep.performance_start_time),
        endMin: timeToMinutes(ep.performance_end_time),
        startStr: toHHMM(ep.performance_start_time),
        endStr: toHHMM(ep.performance_end_time),
        icon: Music4,
        color: "text-emerald-600",
      },
    ].filter((e) => !isNaN(e.startMin));

    return rows.sort((a, b) => a.startMin - b.startMin);
  }, [ep, soundcheckEnd]);

  if (events.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
        Add times below to build the event timeline.
      </div>
    );
  }

  const Item = ({ event, last }: { event: (typeof events)[number]; last: boolean }) => {
    const duration =
      !isNaN(event.endMin) && event.endMin > event.startMin
        ? formatDuration(event.startMin, event.endMin)
        : null;
    const Icon = event.icon as any;

    return (
      <div className="relative flex items-start gap-4 pb-8">
        {!last && <div className="absolute left-[18px] top-5 h-full w-0.5 bg-gray-200" />}
        <div className={`z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white ring-8 ring-white ${event.color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="font-semibold text-gray-800">{event.label}</p>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-gray-500">
            <Clock className="h-3.5 w-3.5" />
            <span>
              {event.startStr}
              {event.endStr && ` – ${event.endStr}`}
            </span>
            {duration && <span className="text-xs font-medium text-gray-400">({duration})</span>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mb-4">
      {issues.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-semibold">Timeline has issues</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {issues.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      <div>
        {events.map((e, i) => (
          <Item key={e.key} event={e} last={i === events.length - 1} />
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Main Component
   ────────────────────────────────────────────────────────────────────────── */
export default function EventPrepForm({ bookingId }: { bookingId: number }) {
  const { user } = useAuth();
  const isProvider = user?.user_type === "service_provider";

  const {
    booking,
    ep,
    riderUrl,
    attachments,
    saving,
    saved,
    patch,
    uploadAttachment,
    deleteAttachment,
    soundcheckEnd,
    setSoundcheckEnd,
  } = useEventPrep(bookingId);

  const { expanded, setExpanded } = useTimelinePrefs(bookingId);

  const progress = useMemo(
    () => ({ done: ep?.progress_done ?? 0, total: ep?.progress_total ?? 0 }),
    [ep]
  );

  const orderIssues = useMemo(() => {
    if (!ep) return [] as string[];
    const points = {
      loadin_start: timeToMinutes(ep.loadin_start),
      loadin_end: timeToMinutes(ep.loadin_end),
      soundcheck_time: timeToMinutes(ep.soundcheck_time),
      soundcheck_end_time: timeToMinutes(soundcheckEnd),
      guests_arrival_time: timeToMinutes(ep.guests_arrival_time),
      performance_start_time: timeToMinutes(ep.performance_start_time),
      performance_end_time: timeToMinutes(ep.performance_end_time),
    };
    const checks: { a: keyof typeof points; b: keyof typeof points; al: string; bl: string }[] = [
      { a: "loadin_start", b: "loadin_end", al: "Load-in start", bl: "Load-in end" },
      { a: "loadin_end", b: "soundcheck_time", al: "Load-in end", bl: "Soundcheck start" },
      { a: "soundcheck_time", b: "soundcheck_end_time", al: "Soundcheck start", bl: "Soundcheck end" },
      { a: "soundcheck_end_time", b: "guests_arrival_time", al: "Soundcheck end", bl: "Guest arrival" },
      { a: "guests_arrival_time", b: "performance_start_time", al: "Guests arrive", bl: "Performance start" },
      { a: "performance_start_time", b: "performance_end_time", al: "Performance start", bl: "Performance end" },
    ];
    return checks
      .map(({ a, b, al, bl }) => {
        const ta = points[a];
        const tb = points[b];
        if (!isNaN(ta) && !isNaN(tb) && tb <= ta) return `${bl} must be after ${al}.`;
        return null;
      })
      .filter((x): x is string => !!x);
  }, [ep, soundcheckEnd]);

  if (!ep || !booking) {
    return (
      <div className="flex min-height-[60vh] items-center justify-center text-gray-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
      </div>
    );
  }

  // Derived
  const eventDate = booking.start_time ? new Date(booking.start_time) : null;
  const soundNeeded = Boolean((ep as any)?.is_sound_required ?? (booking as any)?.requires_sound ?? false);
  const techOwner = ep.tech_owner === "artist" ? "Artist brings PA" : "Venue system";
  const clientTooltip = "This is to be filled in by the client";
  const providerTooltip = "This is to be filled in by the artist";
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
  const receiptUrl = booking.payment_id ? `${apiBase}/api/v1/payments/${booking.payment_id}/receipt` : null;
  const icsUrl = `${apiBase}/api/v1/bookings/${bookingId}/calendar.ics`;
  const venueAddress = booking?.service?.service_provider?.location || "";
  const mapsUrl = venueAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueAddress)}` : null;
  const heroImage =
    booking?.service?.media_url ||
    booking?.service?.service_provider?.cover_photo_url ||
    booking?.service?.service_provider?.profile_picture_url ||
    "";

  const SidebarContent = () => (
    <>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {heroImage ? (
          <div className="aspect-[16/9] w-full overflow-hidden bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroImage} alt="Service image" className="h-full w-full object-cover" />
          </div>
        ) : null}
        <div className="p-5">
          <p className="text-sm font-semibold text-gray-900">Booking Summary</p>
          <div className="mt-1 text-xs text-gray-500">{booking.service?.title}</div>
          <div className="mt-4 space-y-3 text-sm text-gray-700">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-gray-600" />
              <span>{eventDate ? format(eventDate, "d MMM yyyy") : "…"}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-600" />
              <span className="truncate">{venueAddress || "Location"}</span>
            </div>
            <div className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-gray-600" />
              <span>Total: {ZAR(booking.total_price)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Music4 className="h-4 w-4 text-gray-600" />
              <span>{soundNeeded ? techOwner : "No sound system required"}</span>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="action-button"
              >
                <MapPin className="h-4 w-4" /> Maps
              </a>
            )}
            {receiptUrl && (
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="action-button"
              >
                <ReceiptText className="h-4 w-4" /> Receipt
              </a>
            )}
            <a
              href={icsUrl}
              className="action-button"
            >
              <CalendarDays className="h-4 w-4" /> Calendar
            </a>
            {riderUrl && (
              <a
                href={riderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="action-button"
              >
                <Music4 className="h-4 w-4" /> Rider
              </a>
            )}
          </div>
        </div>
      </div>

      {progress.done >= progress.total ? (
        <div className="status-box bg-emerald-50 border-emerald-200 text-emerald-900">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Ready to go!</p>
            <p className="text-emerald-800/80">All details filled in. Changes auto-save.</p>
          </div>
        </div>
      ) : (
        <div className="status-box bg-amber-50 border-amber-200 text-amber-900">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Awaiting details</p>
            <p className="text-amber-800/80">Please complete the remaining sections.</p>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Sticky header */}
      <div className="sticky top-4 z-10 mb-6 rounded-2xl border border-gray-200 bg-white/80 p-3 shadow-lg backdrop-blur sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-base font-semibold text-gray-900 sm:text-lg">
              {booking.service?.title || "Event Preparation"}
            </p>
            <p className="text-xs text-gray-600">
              Prep {progress.done}/{progress.total}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SavedPill saving={saving} saved={saved} />
            <Link
              href={`/dashboard/events/${bookingId}`}
              className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              View booking
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile sidebar summary */}
      <div className="mb-8 space-y-6 lg:hidden">
        <SidebarContent />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr,380px]">
        <main className="space-y-8">
          {/* Timeline section with ONLY expand/collapse */}
         {/* --- Event Timeline (visual collapses; inputs always visible) --- */}
<Section
  title="Event Timeline"
  subtitle="All times are local to the event"
  actions={
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      aria-pressed={expanded}
      aria-expanded={expanded}
    >
      {expanded ? "Hide timeline" : "Show timeline"}
    </button>
  }
>
  {/* Only the visual timeline collapses */}
  {expanded && (
    <VerticalTimeline ep={ep} soundcheckEnd={soundcheckEnd} issues={orderIssues} />
  )}

  {/* Inputs remain always visible */}
  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
    <Field
      id="loadin_start"
      label={`Load-in start ${isProvider ? "(You)" : "(Artist)"}`}
      disabled={!isProvider}
      tooltip={providerTooltip}
    >
      <TextInput
        id="loadin_start"
        type="time"
        value={toHHMM(ep.loadin_start)}
        onChange={(e) => patch({ loadin_start: e.target.value })}
        disabled={!isProvider}
      />
    </Field>

    <Field
      id="loadin_end"
      label={`Load-in end ${isProvider ? "(You)" : "(Artist)"}`}
      disabled={!isProvider}
      tooltip={providerTooltip}
    >
      <TextInput
        id="loadin_end"
        type="time"
        value={toHHMM(ep.loadin_end)}
        onChange={(e) => patch({ loadin_end: e.target.value })}
        disabled={!isProvider}
      />
    </Field>

    <Field id="soundcheck_start" label="Soundcheck start">
      <TextInput
        id="soundcheck_start"
        type="time"
        value={toHHMM(ep.soundcheck_time)}
        onChange={(e) => patch({ soundcheck_time: e.target.value })}
      />
    </Field>

    <Field id="soundcheck_end" label="Soundcheck end">
      <TextInput
        id="soundcheck_end"
        type="time"
        value={toHHMM(soundcheckEnd)}
        onChange={(e) => {
          const v = e.target.value;
          setSoundcheckEnd(v);
          writeLocalTimes(bookingId, { soundcheck_end_time: v });
          const nextNotes = composeSoundcheckEndIntoNotes(ep.schedule_notes || "", v);
          patch({ schedule_notes: nextNotes });
        }}
      />
    </Field>

    <Field
      id="guests_arrival_time"
      label={`Guests arrive ${isProvider ? "(Client)" : "(You)"}`}
      disabled={isProvider}
      tooltip={clientTooltip}
    >
      <TextInput
        id="guests_arrival_time"
        type="time"
        value={toHHMM(ep.guests_arrival_time)}
        onChange={(e) => patch({ guests_arrival_time: e.target.value })}
        disabled={isProvider}
      />
    </Field>

    <Field
      id="performance_start_time"
      label={`Performance starts ${isProvider ? "(Client)" : "(You)"}`}
      disabled={isProvider}
      tooltip={clientTooltip}
    >
      <TextInput
        id="performance_start_time"
        type="time"
        value={toHHMM(ep.performance_start_time)}
        onChange={(e) => patch({ performance_start_time: e.target.value })}
        disabled={isProvider}
      />
    </Field>

    <Field
      id="performance_end_time"
      label={`Performance ends ${isProvider ? "(Client)" : "(You)"}`}
      disabled={isProvider}
      tooltip={clientTooltip}
    >
      <TextInput
        id="performance_end_time"
        type="time"
        value={toHHMM(ep.performance_end_time)}
        onChange={(e) => patch({ performance_end_time: e.target.value })}
        disabled={isProvider}
      />
    </Field>
  </div>

  <div className="mt-4">
    <Field id="schedule_notes" label="Schedule notes (sets, breaks, speeches)">
      <TextArea
        id="schedule_notes"
        rows={3}
        placeholder="Two 45-min sets with a 15-min break, speeches at 20:30."
        value={ep.schedule_notes || ""}
        onChange={(e) => patch({ schedule_notes: e.target.value })}
      />
    </Field>
  </div>
</Section>

          {/* People & Place */}
          <Section title="People & Place" subtitle="Key contact and venue info">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                id="day_of_contact_name"
                label={`On-the-day contact ${isProvider ? "(Client)" : "(You)"}`}
                disabled={isProvider}
                tooltip={clientTooltip}
              >
                <TextInput
                  id="day_of_contact_name"
                  placeholder="e.g., Jane Doe (Venue Manager)"
                  value={ep.day_of_contact_name || ""}
                  onChange={(e) => patch({ day_of_contact_name: e.target.value })}
                  disabled={isProvider}
                />
              </Field>
              <Field
                id="day_of_contact_phone"
                label={`Mobile ${isProvider ? "(Client)" : "(You)"}`}
                disabled={isProvider}
                tooltip={clientTooltip}
              >
                <TextInput
                  id="day_of_contact_phone"
                  type="tel"
                  placeholder="+27 82 123 4567"
                  value={ep.day_of_contact_phone || ""}
                  onChange={(e) => patch({ day_of_contact_phone: e.target.value })}
                  disabled={isProvider}
                />
              </Field>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg border bg-gray-50 p-4">
                <div className="flex items-center gap-2 text-sm text-gray-800">
                  <MapPin className="h-4 w-4 text-gray-600" /> Venue address
                </div>
                <div className="mt-1 text-sm text-gray-700">
                  {ep.venue_address ? (
                    ep.venue_address
                  ) : (
                    <Link href={`/dashboard/events/${bookingId}`} className="text-blue-600 hover:underline">
                      Add venue address on the event page.
                    </Link>
                  )}
                </div>
              </div>
              <Field id="parking_access_notes" label="Parking & access notes">
                <TextArea
                  id="parking_access_notes"
                  rows={3}
                  placeholder="Load-in via service entrance. Access code #1234."
                  value={ep.parking_access_notes || ""}
                  onChange={(e) => patch({ parking_access_notes: e.target.value })}
                />
              </Field>
            </div>
          </Section>

          {/* Files & Notes */}
          <Section title="Files & Notes" subtitle="Share programs or add final details">
            <Field id="notes" label="General notes">
              <TextArea
                id="notes"
                rows={4}
                placeholder="Stage plots, guest lists, special announcements…"
                value={ep.notes || ""}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </Field>
            <div className="mt-3">
              <label className="mb-2 block text-[13px] font-medium text-gray-700">
                Attachments
              </label>
              <AttachmentUploader
                onUpload={uploadAttachment}
                attachments={attachments}
                onDelete={deleteAttachment}
              />
            </div>
          </Section>
        </main>

        {/* Desktop sidebar */}
        <aside className="hidden space-y-6 lg:sticky lg:top-28 lg:block lg:self-start">
          <SidebarContent />
        </aside>
      </div>

      <style jsx global>{`
        .action-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          border-radius: 0.75rem;
          border: 1px solid #e5e7eb;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          line-height: 1.25rem;
          color: #374151;
          background-color: white;
          transition: background-color 0.15s ease-in-out;
        }
        .action-button:hover {
          background-color: #f9fafb;
        }
        .status-box {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          border-radius: 1rem;
          border-width: 1px;
          padding: 1rem;
          font-size: 0.875rem;
          line-height: 1.25rem;
          margin-top: 1rem;
        }
      `}</style>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Attachment Uploader
   ────────────────────────────────────────────────────────────────────────── */
function AttachmentUploader({
  onUpload,
  attachments,
  onDelete,
}: {
  onUpload: (file: File) => Promise<void> | void;
  attachments: EventPrepAttachment[];
  onDelete: (id: number) => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = async (file?: File) => {
    if (!file) return;
    await onUpload(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onPick = () => inputRef.current?.click();
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => handleFile(e.target.files?.[0]);

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const fileName = (url: string) => {
    try {
      const u = new URL(url);
      return decodeURIComponent(u.pathname.split("/").pop() || url);
    } catch {
      return decodeURIComponent(url.split("/").pop() || url);
    }
  };

  return (
    <div>
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        className={`relative rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          isDragging ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-2">
          <UploadCloud className={`h-7 w-7 ${isDragging ? "text-blue-600" : "text-gray-500"}`} />
          <p className="text-sm text-gray-600">
            <button
              type="button"
              onClick={onPick}
              className="font-semibold text-blue-600 hover:underline focus:outline-none"
            >
              Click to upload
            </button>{" "}
            or drag and drop
          </p>
          <p className="text-xs text-gray-500">PDF or Images accepted</p>
        </div>
        <input ref={inputRef} type="file" className="hidden" onChange={onChange} accept="application/pdf,image/*" />
      </div>

      {attachments.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm">
          {attachments.map((a) => (
            <li key={a.id} className="group flex items-center justify-between rounded-lg bg-gray-50 p-2.5 transition hover:bg-gray-100">
              <a href={a.file_url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
                {fileName(a.file_url)}
              </a>
              <button
                type="button"
                onClick={() => onDelete(a.id)}
                className="ml-2 rounded-md p-1.5 text-gray-400 opacity-0 transition hover:bg-red-100 hover:text-red-600 group-hover:opacity-100"
                aria-label="Delete attachment"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
