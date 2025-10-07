"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays, parseISO } from "date-fns";
import Link from "next/link";

import { EventPrep } from "@/types";
import { getEventPrep } from "@/lib/api";
import useWebSocket from "@/hooks/useWebSocket";
import { useAuth } from "@/contexts/AuthContext";
import EventPrepSkeleton from "./EventPrepSkeleton";

// ───────────────────────────────────────────────────────────────────────────────
// Simple in-memory cache so Event Prep renders instantly on thread switch.
// ───────────────────────────────────────────────────────────────────────────────
const EVENT_PREP_CACHE: Map<number, EventPrep> = new Map();

type EventPrepCardProps = {
  bookingId: number;
  bookingRequestId: number;
  eventDateISO?: string;
  canEdit: boolean;
  onContinuePrep?: (bookingId: number) => void;
  /** If true, show only the compact summary header (no details). */
  summaryOnly?: boolean;
};

// ───────────────────────────────────────────────────────────────────────────────
// Small helpers for the glass effect (noise + gradient ring)
// NOTE: Tailwind arbitrary values are used for the iOS-style polish.
// Everything still works if backdrop-filter isn’t supported (falls back to soft bg).
// ───────────────────────────────────────────────────────────────────────────────
const NOISE_DATA_URL =
  "url(\"data:image/svg+xml;utf8,\
<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'>\
<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>\
<feColorMatrix type='saturate' values='0'/>\
<feComponentTransfer><feFuncA type='table' tableValues='0 0 0 0 0 0 0 0 0.02 0.03 0.04 0.05'/></feComponentTransfer>\
</filter><rect width='100%' height='100%' filter='url(%23n)'/>\
</svg>\")";

function GlassCard({
  children,
  as: Tag = "section",
  summaryOnly,
  className = "",
  ...rest
}: React.PropsWithChildren<{ as?: any; summaryOnly?: boolean; className?: string } & React.HTMLAttributes<HTMLElement>>) {
  // Base liquid-glass panel
  const base =
    "relative rounded-2xl transition-all " +
    "backdrop-blur-xl bg-white/6 dark:bg-white/8 " + // frosted layer
    "ring-1 ring-white/20 dark:ring-white/15 " + // subtle ring
    "shadow-[0_8px_30px_rgba(0,0,0,0.12)] " + // soft drop shadow
    "hover:shadow-[0_12px_40px_rgba(0,0,0,0.16)] focus-visible:shadow-[0_12px_40px_rgba(0,0,0,0.18)] " +
    (summaryOnly ? "px-3 py-2" : "p-3");

  // Gradient border shimmer (very subtle)
  // Uses an absolutely positioned pseudo element
  const gradientBorder =
    "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] " +
    "before:[background:linear-gradient(130deg,rgba(255,255,255,0.45),rgba(255,255,255,0.05)_35%,rgba(255,255,255,0.25)_65%,rgba(255,255,255,0.06))] " +
    "before:opacity-60 before:mix-blend-soft-light";

  // Highlight sheen at the top (inner light)
  const innerSheen =
    "after:pointer-events-none after:absolute after:inset-x-1 after:top-1 after:h-6 after:rounded-xl " +
    "after:bg-[radial-gradient(120%_60%_at_50%_0%,rgba(255,255,255,0.75),rgba(255,255,255,0.05)_60%,transparent_70%)] " +
    "after:opacity-70";

  // Ultra-faint noise to avoid banding on large monitors
  const noiseStyle: React.CSSProperties = {
    backgroundImage: `${NOISE_DATA_URL}`,
    backgroundSize: "160px 160px",
    backgroundRepeat: "repeat",
    maskImage:
      "radial-gradient(120% 120% at 50% 0%, rgba(0,0,0,0.18), rgba(0,0,0,0.10) 60%, rgba(0,0,0,0))",
  };

  return (
    <Tag
      className={`${base} ${gradientBorder} ${innerSheen} ${className}`}
      style={noiseStyle}
      {...rest}
    >
      {/* Safe contrast wrapper (text colors) */}
      <div className="text-zinc-900/90 dark:text-zinc-100/90">{children}</div>
    </Tag>
  );
}

// Progress pill with tiny “liquid” gloss
function ProgressPill({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <span
      className="relative inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold
                 text-zinc-800/90 dark:text-zinc-100/90
                 bg-white/50 dark:bg-white/10
                 ring-1 ring-white/40 dark:ring-white/15
                 backdrop-blur-sm select-none"
      aria-label={`Prep ${done}/${total}`}
      title={`${pct}%`}
    >
      <span className="relative z-10">Prep {done}/{total}</span>
      {/* glossy top highlight */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1 rounded-md
                       bg-[linear-gradient(to_bottom,rgba(255,255,255,0.9),rgba(255,255,255,0))]" />
    </span>
  );
}

// Tiny, high-contrast secondary text (never below AA on both themes)
function SecondaryText({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`text-[11px] text-zinc-800/80 dark:text-zinc-100/80 ${className}`}>{children}</span>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Main Component
// ───────────────────────────────────────────────────────────────────────────────
const EventPrepCard: React.FC<EventPrepCardProps> = ({
  bookingId,
  bookingRequestId,
  eventDateISO,
  canEdit: _canEdit,
  onContinuePrep,
  summaryOnly,
}) => {
  const router = useRouter();
  const [ep, setEp] = useState<EventPrep | null>(null);
  const [initializing, setInitializing] = useState(true);
  const { token: authToken } = useAuth();

  // SWR-ish bootstrap with cache
  useEffect(() => {
    let mounted = true;
    const cached = EVENT_PREP_CACHE.get(bookingId);
    if (cached) {
      setEp(cached);
      setInitializing(false);
    } else {
      setInitializing(true);
    }
    (async () => {
      try {
        const data = await getEventPrep(bookingId);
        if (!mounted) return;
        setEp(data);
        EVENT_PREP_CACHE.set(bookingId, data);
      } catch {
        // ignore; fall back to CTA
      } finally {
        if (mounted) setInitializing(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [bookingId]);

  // WS for live updates
  const token = useMemo(() => {
    const t =
      authToken ||
      (typeof window !== "undefined"
        ? localStorage.getItem("token") || sessionStorage.getItem("token") || null
        : null);
    return t && t.trim().length > 0 ? t : null;
  }, [authToken]);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const wsBase = apiBase.replace(/^http/, "ws");
  const [wsUrl, setWsUrl] = useState<string | null>(null);

  useEffect(() => {
    const base = `${wsBase}/api/v1/ws/booking-requests/${bookingRequestId}`;
    setWsUrl(token ? `${base}?token=${encodeURIComponent(token)}` : null);
  }, [wsBase, bookingRequestId, token]);

  const { onMessage: onSocketMessage } = useWebSocket(wsUrl || undefined);

  useEffect(() => {
    return onSocketMessage((event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data?.type === "event_prep_updated" && data?.payload?.booking_id === bookingId) {
          setEp((prev) => {
            const next = { ...(prev || ({} as any)), ...data.payload } as EventPrep;
            EVENT_PREP_CACHE.set(bookingId, next);
            return next;
          });
        }
      } catch {
        /* ignore */
      }
    });
  }, [bookingId, onSocketMessage]);

  const progress = useMemo(
    () => ({
      done: ep?.progress_done ?? 0,
      total: ep?.progress_total ?? 0,
    }),
    [ep]
  );

  const daysToGo = useMemo(() => {
    const iso = (ep as any)?.start_time || eventDateISO || null;
    try {
      if (!iso) return null;
      const d = typeof iso === "string" ? parseISO(iso) : new Date(iso);
      const days = differenceInCalendarDays(d, new Date());
      return isNaN(days) ? null : Math.max(0, days);
    } catch {
      return null;
    }
  }, [ep, eventDateISO]);

  // ───────────────────────────
  // Loading state
  // ───────────────────────────
  if (initializing) {
    return <EventPrepSkeleton summaryOnly={summaryOnly} />;
  }

  // ───────────────────────────
  // CTA (no prep record)
  // ───────────────────────────
  if (!ep) {
    return (
      <GlassCard
        role="button"
        tabIndex={0}
        summaryOnly={summaryOnly}
        aria-label="Event preparation"
        className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-0"
        onClick={() =>
          onContinuePrep ? onContinuePrep(bookingId) : router.push(`/dashboard/events/${bookingId}`)
        }
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onContinuePrep
              ? onContinuePrep(bookingId)
              : router.push(`/dashboard/events/${bookingId}`);
          }
        }}
      >
        <div className={summaryOnly ? "flex items-center justify-between gap-3" : "flex items-start justify-between gap-3"}>
          <div>
            {summaryOnly ? (
              <Link
                href={`/dashboard/events/${bookingId}`}
                onClick={(e) => e.stopPropagation()}
                className="no-underline"
              >
                <h3 className="text-sm font-semibold tracking-tight">Let’s prep your event</h3>
              </Link>
            ) : (
              <h3 className="text-lg font-semibold tracking-tight">Let’s prep your event</h3>
            )}
            <SecondaryText className="block mt-0.5">
              A quick checklist to keep the day smooth.
            </SecondaryText>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className={
                summaryOnly
                  ? "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold bg-white/50 dark:bg-white/10 ring-1 ring-white/40 dark:ring-white/15 backdrop-blur-sm"
                  : "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold bg-white/50 dark:bg-white/10 ring-1 ring-white/40 dark:ring-white/15 backdrop-blur-sm"
              }
            >
              Prep —
            </span>
          </div>
        </div>
      </GlassCard>
    );
  }

  // ───────────────────────────
  // Summary card
  // ───────────────────────────
  return (
    <GlassCard
      role="button"
      tabIndex={0}
      summaryOnly={summaryOnly}
      aria-label="Event preparation"
      className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-0"
      onClick={() =>
        onContinuePrep ? onContinuePrep(bookingId) : router.push(`/dashboard/events/${bookingId}`)
      }
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onContinuePrep
            ? onContinuePrep(bookingId)
            : router.push(`/dashboard/events/${bookingId}`);
        }
      }}
    >
      <div className={summaryOnly ? "flex items-center justify-between gap-3" : "flex items-start justify-between gap-3"}>
        <div>
          {summaryOnly ? (
            <Link
              href={`/dashboard/events/${bookingId}`}
              onClick={(e) => e.stopPropagation()}
              className="no-underline"
            >
              <h3 className="text-sm font-semibold tracking-tight">Let’s prep your event</h3>
            </Link>
          ) : (
            <h3 className="text-lg font-semibold tracking-tight">Let’s prep your event</h3>
          )}
          <SecondaryText className="block mt-0.5">
            A quick checklist to keep the day smooth.
          </SecondaryText>
        </div>

        <div className="flex flex-col items-end gap-1">
          <ProgressPill done={progress.done} total={progress.total} />
          {daysToGo !== null && (
            <span
              className={summaryOnly ? "text-[10px] text-zinc-800/80 dark:text-zinc-100/80" : "text-xs text-zinc-800/80 dark:text-zinc-100/80"}
              aria-label={`In ${daysToGo} days`}
            >
              In {daysToGo} days
            </span>
          )}
        </div>
      </div>
    </GlassCard>
  );
};

export default EventPrepCard;
