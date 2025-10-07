"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import Link from 'next/link';

import { EventPrep } from '@/types';
import { getEventPrep } from '@/lib/api';
import useWebSocket from '@/hooks/useWebSocket';
import { useAuth } from '@/contexts/AuthContext';
import EventPrepSkeleton from './EventPrepSkeleton';

// Simple in-memory cache so Event Prep renders instantly on thread switch.
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

const EventPrepCard: React.FC<EventPrepCardProps> = ({ bookingId, bookingRequestId, eventDateISO, canEdit: _canEdit, onContinuePrep, summaryOnly }) => {
  const router = useRouter();
  const [ep, setEp] = useState<EventPrep | null>(null);
  const [initializing, setInitializing] = useState(true);
  const { token: authToken } = useAuth();

  // Bootstrap data with stale-while-revalidate using the in-memory cache
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
    return () => { mounted = false; };
  }, [bookingId]);

  // WS subscription for live updates (progress, etc.)
  const token = useMemo(() => {
    const t = authToken || (typeof window !== 'undefined' ? (localStorage.getItem('token') || sessionStorage.getItem('token') || null) : null);
    return (t && t.trim().length > 0) ? t : null;
  }, [authToken]);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const wsBase = apiBase.replace(/^http/, 'ws');
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
        if (data?.type === 'event_prep_updated' && data?.payload?.booking_id === bookingId) {
          setEp((prev) => {
            const next = { ...(prev || ({} as any)), ...data.payload } as EventPrep;
            EVENT_PREP_CACHE.set(bookingId, next);
            return next;
          });
        }
      } catch { /* ignore */ }
    });
  }, [bookingId, onSocketMessage]);

  const progress = useMemo(() => ({
    done: ep?.progress_done ?? 0,
    total: ep?.progress_total ?? 0,
  }), [ep]);

  const daysToGo = useMemo(() => {
    const iso = (ep as any)?.start_time || eventDateISO || null;
    try {
      if (!iso) return null;
      const d = typeof iso === 'string' ? parseISO(iso) : new Date(iso);
      const days = differenceInCalendarDays(d, new Date());
      return isNaN(days) ? null : Math.max(0, days);
    } catch { return null; }
  }, [ep, eventDateISO]);

  // Loading state skeleton
  if (initializing) {
    return <EventPrepSkeleton summaryOnly={summaryOnly} />;
  }

  // CTA when prep record is missing
  if (!ep) {
    return (
      <section
        className={summaryOnly ? 'rounded-xl border border-gray-200 bg-white text-gray-900 px-3 py-2 cursor-pointer' : 'rounded-2xl shadow border border-gray-200 bg-indigo-50 text-gray-900 p-3 cursor-pointer'}
        aria-label="Event preparation"
        role="button"
        tabIndex={0}
        onClick={() => (onContinuePrep ? onContinuePrep(bookingId) : router.push(`/dashboard/events/${bookingId}`))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onContinuePrep ? onContinuePrep(bookingId) : router.push(`/dashboard/events/${bookingId}`);
          }
        }}
      >
        <div className={summaryOnly ? 'flex items-center justify-between gap-3' : 'flex items-start justify-between gap-3'}>
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
            <p className={summaryOnly ? 'text-[10px] text-gray-700 mt-0.5' : 'text-[11px] text-gray-700 mt-0.5'}>
              A quick checklist to keep the day smooth.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={summaryOnly ? 'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-700' : 'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold bg-gray-100 text-gray-700'}>
              Prep —
            </span>
          </div>
        </div>
      </section>
    );
  }

  // Minimal summary UI (heading, subtitle, progress, and days)
  return (
    <section
      className={summaryOnly ? 'rounded-xl border border-gray-200 bg-indigo-50 text-gray-900 px-3 py-2 cursor-pointer' : 'rounded-2xl shadow border border-gray-200 bg-indigo-50 text-gray-900 p-3 cursor-pointer'}
      aria-label="Event preparation"
      role="button"
      tabIndex={0}
      onClick={() => (onContinuePrep ? onContinuePrep(bookingId) : router.push(`/dashboard/events/${bookingId}`))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onContinuePrep ? onContinuePrep(bookingId) : router.push(`/dashboard/events/${bookingId}`);
        }
      }}
    >
      <div className={summaryOnly ? 'flex items-center justify-between gap-3' : 'flex items-start justify-between gap-3'}>
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
          <p className={summaryOnly ? 'text-[10px] text-gray-700 mt-0.5' : 'text-[11px] text-gray-700 mt-0.5'}>A quick checklist to keep the day smooth.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={summaryOnly ? 'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-700' : 'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold bg-gray-100 text-gray-700'} aria-label={`Prep ${progress.done}/${progress.total}`}>
            Prep {progress.done}/{progress.total}
          </span>
          {daysToGo !== null && (
            <span className={summaryOnly ? 'text-[10px] text-gray-700' : 'text-xs text-gray-700'} aria-label={`In ${daysToGo} days`}>In {daysToGo} days</span>
          )}
        </div>
      </div>
    </section>
  );
};

export default EventPrepCard;

