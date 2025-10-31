"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays, parseISO } from "date-fns";
import Link from "next/link";

import { EventPrep } from "@/types";
import { getEventPrep } from "@/lib/api";
import { useRealtimeContext } from "@/contexts/chat/RealtimeContext";

// ───────────────────────────────────────────────────────────────────────────────
// In-memory cache for instant thread switching
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
// Glass primitives (contrast-safe, iOS-ish liquid glass, readable on light pages)
// ───────────────────────────────────────────────────────────────────────────────
const NOISE_DATA_URL =
  "url(\"data:image/svg+xml;utf8,\
<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'>\
<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>\
<feColorMatrix type='saturate' values='0'/>\
<feComponentTransfer><feFuncA type='table' tableValues='0 0 0 0.02 0.03'/></feComponentTransfer></filter>\
<rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

function GlassCard({
  children,
  as: Tag = "section",
  summaryOnly,
  className = "",
  ...rest
}: React.PropsWithChildren<
  { as?: any; summaryOnly?: boolean; className?: string } & React.HTMLAttributes<HTMLElement>
>) {
  const base =
    "relative rounded-2xl transition-all " +
    "backdrop-blur-xl backdrop-saturate-150 " +
    "bg-white/30 dark:bg-zinc-900/35 " + // more opaque = better text contrast
    "ring-1 ring-black/10 dark:ring-white/10 " +
    "shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.18)] " +
    (summaryOnly ? "px-3 py-2" : "p-3");

  // Subtle gradient rim (normal blend; won’t wash text)
  const gradientRim =
    "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] " +
    "before:[background:linear-gradient(140deg,rgba(255,255,255,0.6),rgba(255,255,255,0.18)_40%,rgba(255,255,255,0.45)_75%,rgba(255,255,255,0.15))] " +
    "before:opacity-55";

  // Top sheen for the “liquid” feel
  const topSheen =
    "after:pointer-events-none after:absolute after:inset-x-1 after:top-1 after:h-6 after:rounded-xl " +
    "after:bg-[radial-gradient(120%_60%_at_50%_0%,rgba(255,255,255,0.55),rgba(255,255,255,0.06)_60%,transparent_75%)] " +
    "after:opacity-70";

  const noiseStyle: React.CSSProperties = {
    backgroundImage: NOISE_DATA_URL,
    backgroundSize: "160px 160px",
  };

  return (
    <Tag className={`${base} ${gradientRim} ${topSheen} ${className}`} style={noiseStyle} {...rest}>
      {/* Hard-set contrast so nothing inherits low opacity from parents */}
      <div className="text-zinc-900 dark:text-zinc-50 antialiased [text-shadow:0_0.5px_0_rgba(255,255,255,0.3)] dark:[text-shadow:0_0.5px_0_rgba(0,0,0,0.25)]">
        {children}
      </div>
    </Tag>
  );
}

function SecondaryText({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  // 90% opacity = AA on frosted bg in light & dark
  return (
    <span className={`text-[11px] text-zinc-800/90 dark:text-zinc-200/90 ${className}`}>
      {children}
    </span>
  );
}

function ProgressPill({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <span
      className="relative inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold
                 text-zinc-800/90 dark:text-zinc-100/90
                 bg-white/55 dark:bg-white/10
                 ring-1 ring-black/10 dark:ring-white/15 backdrop-blur-sm select-none"
      aria-label={`Prep ${done}/${total}`}
      title={`${pct}%`}
    >
      <span className="relative z-10">Prep {done}/{total}</span>
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1 rounded-md
                       bg-[linear-gradient(to_bottom,rgba(255,255,255,0.9),rgba(255,255,255,0))]" />
    </span>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Component
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
  const { subscribe } = useRealtimeContext();

  // Bootstrap with stale-while-revalidate using cache
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
        // ignore; CTA fallback below
      } finally {
        if (mounted) setInitializing(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [bookingId]);

  // Live updates via multiplex realtime topic (single global connection)
  useEffect(() => {
    const topic = `booking-requests:${bookingRequestId}`;
    const unsubscribe = subscribe(topic, (env: any) => {
      try {
        // Multiplex envelopes: { type: 'message', payload: { data|message: { type, payload } } }
        const inner = (env?.payload?.message || env?.payload?.data || env?.payload) || env;
        const t = String((inner?.type || env?.type || '')).toLowerCase();
        if (t !== 'event_prep_updated') return;
        const payload = (inner?.payload || env?.payload?.payload || env?.payload) as any;
        if (!payload) return;
        const bid = Number(payload.booking_id || 0);
        // Persist discovered booking id for this thread so other components can hydrate quickly
        if (bid > 0) {
          try { sessionStorage.setItem(`bookingId:br:${bookingRequestId}`, String(bid)); } catch {}
        }
        // If this card already has a concrete bookingId, ensure events match that booking
        if (Number.isFinite(bookingId) && bookingId > 0 && bid > 0 && bid !== Number(bookingId)) return;
        setEp((prev) => {
          const next = { ...(prev || ({} as any)), ...payload } as EventPrep;
          // Cache by concrete booking id when available; fall back to prop
          const cacheKey = bid > 0 ? bid : bookingId;
          if (cacheKey > 0) EVENT_PREP_CACHE.set(cacheKey, next);
          return next;
        });
      } catch {
        // ignore parse errors
      }
    });
    return () => { try { unsubscribe(); } catch {} };
  }, [subscribe, bookingRequestId, bookingId]);

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

  // Click handler for header/button: prefer onContinuePrep, fallback to router
  const handleHeaderClick = (e?: React.MouseEvent) => {
    try { e?.stopPropagation?.(); } catch {}
    try {
      if (onContinuePrep) onContinuePrep(bookingId);
      else router.push(`/dashboard/events/${bookingId}`);
    } catch {}
  };

  // No skeleton — render a minimal CTA instantly; data hydrates in the background

  // CTA when no prep record exists
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
        <div
          className={
            summaryOnly
              ? "flex items-center justify-between gap-3"
              : "flex items-start justify-between gap-3"
          }
        >
          <div>
            {summaryOnly ? (
              bookingId > 0 ? (
                <Link
                  href={`/dashboard/events/${bookingId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="no-underline"
                >
                  <h3 className="text-sm font-semibold tracking-tight !text-zinc-900 dark:!text-zinc-50">
                    Let’s prep your event
                  </h3>
                </Link>
              ) : (
                <button type="button" onClick={handleHeaderClick} className="no-underline">
                  <h3 className="text-sm font-semibold tracking-tight !text-zinc-900 dark:!text-zinc-50">
                    Let’s prep your event
                  </h3>
                </button>
              )
            ) : (
              <h3 className="text-lg font-semibold tracking-tight !text-zinc-900 dark:!text-zinc-50">
                Let’s prep your event
              </h3>
            )}
            <SecondaryText className="block mt-0.5">
              A quick checklist to keep the day smooth.
            </SecondaryText>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className={
                summaryOnly
                  ? "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold bg-white/55 dark:bg-white/10 ring-1 ring-black/10 dark:ring-white/15 backdrop-blur-sm"
                  : "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold bg-white/55 dark:bg-white/10 ring-1 ring-black/10 dark:ring-white/15 backdrop-blur-sm"
              }
            >
              Prep —
            </span>
          </div>
        </div>
      </GlassCard>
    );
  }

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
      <div
        className={
          summaryOnly
            ? "flex items-center justify-between gap-3"
            : "flex items-start justify-between gap-3"
        }
      >
        <div>
          {summaryOnly ? (
            bookingId > 0 ? (
              <Link
                href={`/dashboard/events/${bookingId}`}
                onClick={(e) => e.stopPropagation()}
                className="no-underline"
              >
                <h3 className="text-sm font-semibold tracking-tight !text-zinc-900 dark:!text-zinc-50">
                  Let’s prep your event
                </h3>
              </Link>
            ) : (
              <button type="button" onClick={handleHeaderClick} className="no-underline">
                <h3 className="text-sm font-semibold tracking-tight !text-zinc-900 dark:!text-zinc-50">
                  Let’s prep your event
                </h3>
              </button>
            )
          ) : (
            <h3 className="text-lg font-semibold tracking-tight !text-zinc-900 dark:!text-zinc-50">
              Let’s prep your event
            </h3>
          )}
          <SecondaryText className="block mt-0.5">
            A quick checklist to keep the day smooth.
          </SecondaryText>
        </div>

        <div className="flex flex-col items-end gap-1">
          <ProgressPill done={progress.done} total={progress.total} />
          {daysToGo !== null && (
            <span
              className={
                summaryOnly
                  ? "text-[10px] text-zinc-800/90 dark:text-zinc-200/90"
                  : "text-xs text-zinc-800/90 dark:text-zinc-200/90"
              }
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
