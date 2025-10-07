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

// Simple in-memory cache for instant rendering on thread switch.
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

const EventPrepCard: React.FC<EventPrepCardProps> = ({ 
  bookingId, 
  bookingRequestId, 
  eventDateISO, 
  onContinuePrep, 
  summaryOnly 
}) => {
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

  // WS subscription for live updates
  const token = useMemo(() => {
    const t = authToken || (typeof window !== 'undefined' ? (localStorage.getItem('token') || sessionStorage.getItem('token') || null) : null);
    return (t && t.trim().length > 0) ? t : null;
  }, [authToken]);

  const wsUrl = useMemo(() => {
    if (!token) return null;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const wsBase = apiBase.replace(/^http/, 'ws');
    return `${wsBase}/api/v1/ws/booking-requests/${bookingRequestId}?token=${encodeURIComponent(token)}`;
  }, [bookingRequestId, token]);

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
      } catch { /* ignore parsing errors */ }
    });
  }, [bookingId, onSocketMessage]);

  const progress = useMemo(() => {
    const done = ep?.progress_done ?? 0;
    const total = ep?.progress_total ?? 1; // Avoid division by zero
    const percentage = total > 0 ? (done / total) * 100 : 0;
    return { done, total, percentage };
  }, [ep]);

  const daysToGo = useMemo(() => {
    const iso = (ep as any)?.start_time || eventDateISO || null;
    try {
      if (!iso) return null;
      const d = typeof iso === 'string' ? parseISO(iso) : new Date(iso);
      const days = differenceInCalendarDays(d, new Date());
      return isNaN(days) ? null : Math.max(0, days);
    } catch { 
      return null; 
    }
  }, [ep, eventDateISO]);

  const handleInteraction = () => {
    if (onContinuePrep) {
      onContinuePrep(bookingId);
    } else {
      router.push(`/dashboard/events/${bookingId}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleInteraction();
    }
  };
  
  // --- Base Styling for the Glass Effect ---
  const glassCardClasses = `
    group relative text-zinc-800 rounded-3xl p-4 overflow-hidden
    bg-white/40 backdrop-blur-xl
    ring-1 ring-black/5 shadow-lg
    transition-all duration-300 ease-in-out
    hover:shadow-xl hover:bg-white/60 cursor-pointer
  `;

  if (initializing) {
    return <EventPrepSkeleton summaryOnly={summaryOnly} />;
  }

  const titleSize = summaryOnly ? 'text-sm' : 'text-lg';
  const subtitleSize = summaryOnly ? 'text-xs' : 'text-sm';
  const statusTextSize = summaryOnly ? 'text-[11px]' : 'text-xs';

  // --- CTA Card (When no event prep exists) ---
  if (!ep) {
    return (
      <section
        className={glassCardClasses}
        aria-label="Start event preparation"
        role="button"
        tabIndex={0}
        onClick={handleInteraction}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className={`${titleSize} font-semibold tracking-tight`}>Let’s prep your event</h3>
            <p className={`${subtitleSize} text-zinc-600 mt-1`}>A quick checklist to keep the day smooth.</p>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-zinc-400 group-hover:text-zinc-600 transition-colors">
            <path fillRule="evenodd" d="M2 10a.75.75 0 01.75-.75h12.59l-2.1-1.95a.75.75 0 111.02-1.1l3.5 3.25a.75.75 0 010 1.1l-3.5 3.25a.75.75 0 11-1.02-1.1l2.1-1.95H2.75A.75.75 0 012 10z" clipRule="evenodd" />
          </svg>
        </div>
      </section>
    );
  }

  // --- Main Event Prep Card ---
  return (
    <section
      className={glassCardClasses}
      aria-label="Continue event preparation"
      role="button"
      tabIndex={0}
      onClick={handleInteraction}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/dashboard/events/${bookingId}`}
            onClick={(e) => e.stopPropagation()}
            className="no-underline"
          >
            <h3 className={`${titleSize} font-semibold tracking-tight`}>Event Preparation</h3>
          </Link>
          <p className={`${subtitleSize} text-zinc-600 mt-1`}>Your checklist for a successful day.</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span 
            className={`${statusTextSize} font-medium bg-black/5 text-zinc-700 px-2.5 py-1 rounded-full`}
            aria-label={`Preparation progress: ${progress.done} of ${progress.total} items completed.`}
          >
            {progress.done} / {progress.total}
          </span>
          {daysToGo !== null && (
            <span 
              className={`${statusTextSize} text-zinc-600`}
              aria-label={`Event is in ${daysToGo} days.`}
            >
              In {daysToGo} {daysToGo === 1 ? 'day' : 'days'}
            </span>
          )}
        </div>
      </div>

      {/* --- Visual Progress Bar --- */}
      {!summaryOnly && progress.total > 0 && (
        <div className="mt-4" aria-hidden="true">
          <div className="w-full bg-black/5 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-indigo-500 h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>
      )}
    </section>
  );
};

export default EventPrepCard;