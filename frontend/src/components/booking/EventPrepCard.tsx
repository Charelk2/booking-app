"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { differenceInCalendarDays, parseISO } from 'date-fns';

import { EventPrep } from '@/types';
import { getEventPrep, updateEventPrep } from '@/lib/api';
import SavedPill from '@/components/ui/SavedPill';
import useSavedHint from '@/hooks/useSavedHint';
import useWebSocket from '@/hooks/useWebSocket';
import { useAuth } from '@/contexts/AuthContext';

type EventPrepCardProps = {
  bookingId: number;
  bookingRequestId: number;
  eventDateISO?: string;
  canEdit: boolean;
  onContinuePrep?: (bookingId: number) => void;
  collapsed?: boolean;
  onToggle?: () => void;
};

function makeIdemKey(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toHHMM(v?: string | null): string {
  if (!v) return '';
  try {
    const s = v.toString();
    if (s.length >= 5) return s.slice(0, 5);
    return s;
  } catch { return ''; }
}

const Tick: React.FC<{ done?: boolean }> = ({ done }) => (
  done ? (
    <div className="w-5 h-5 rounded bg-emerald-500 text-white text-[12px] grid place-items-center" aria-hidden>
      ✓
    </div>
  ) : (
    <div className="w-5 h-5 rounded border border-white/30" aria-hidden />
  )
);

const EventPrepCard: React.FC<EventPrepCardProps> = ({ bookingId, bookingRequestId, eventDateISO, canEdit, onContinuePrep, collapsed, onToggle }) => {
  const router = useRouter();
  const [ep, setEp] = useState<EventPrep | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loadinStart, setLoadinStart] = useState('');
  const [loadinEnd, setLoadinEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const { saving: savingStd, saved: savedStd, startSaving, doneSaving } = useSavedHint();
  const { user } = useAuth();
  const isProvider = (user?.user_type || '').toString() === 'service_provider';

  // Bootstrap data
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getEventPrep(bookingId);
        if (!mounted) return;
        setEp(data);
        setName(data.day_of_contact_name || '');
        setPhone(data.day_of_contact_phone || '');
        setLoadinStart(toHHMM(data.loadin_start));
        setLoadinEnd(toHHMM(data.loadin_end));
      } catch (e) {
        // swallow
      }
    })();
    return () => { mounted = false; };
  }, [bookingId]);

  // WS subscription for live updates
  const token = typeof window !== 'undefined' ? (localStorage.getItem('token') || sessionStorage.getItem('token') || '') : '';
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const wsBase = apiBase.replace(/^http/, 'ws');
  const { onMessage: onSocketMessage } = useWebSocket(
    `${wsBase}/api/v1/ws/booking-requests/${bookingRequestId}?token=${token}`,
  );

  useEffect(() => {
    return onSocketMessage((event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data?.type === 'event_prep_updated' && data?.payload?.booking_id === bookingId) {
          setEp((prev) => ({ ...(prev || {} as any), ...data.payload }));
        }
      } catch { /* ignore */ }
    });
  }, [bookingId, onSocketMessage]);

  const progress = useMemo(() => ({
    done: ep?.progress_done ?? 0,
    total: ep?.progress_total ?? 0,
  }), [ep]);

  // Derive per-row completion for visuals; infer payment as the remaining done item
  const done_contact = !!(ep?.day_of_contact_name && ep?.day_of_contact_phone);
  const done_venue = !!(ep?.venue_address);
  const done_loadin = !!(ep?.loadin_start && ep?.loadin_end);
  const done_tech = !!(ep?.tech_owner);
  const done_power = !!(ep?.stage_power_confirmed);
  const explicitDone = [done_contact, done_venue, done_loadin, done_tech, done_power].filter(Boolean).length;
  const done_paid = (progress.done || 0) > explicitDone;

  const daysToGo = useMemo(() => {
    const iso = (ep as any)?.start_time || eventDateISO || null;
    try {
      if (!iso) return null;
      const d = typeof iso === 'string' ? parseISO(iso) : new Date(iso);
      const days = differenceInCalendarDays(d, new Date());
      return isNaN(days) ? null : Math.max(0, days);
    } catch { return null; }
  }, [ep, eventDateISO]);

  const patch = useCallback(async (p: Partial<EventPrep>) => {
    if (!ep) return;
    setEp({ ...ep, ...p }); // optimistic
    setSaving(true); startSaving();
    try {
      const fresh = await updateEventPrep(bookingId, p as any, { idempotencyKey: makeIdemKey() });
      setEp((prev) => ({ ...(prev || {} as any), ...fresh }));
    } catch {
      // on failure, keep optimistic (WS or next fetch will correct)
    } finally {
      setSaving(false); doneSaving();
    }
  }, [bookingId, ep]);

  if (!ep) return null;

  return (
    <section className="rounded-2xl shadow border border-[#1F232B] bg-[#0F1216] text-white p-5" aria-label="Event preparation">
      <div className={onToggle ? "flex items-start justify-between gap-3 cursor-pointer" : "flex items-start justify-between gap-3"} onClick={onToggle} role={onToggle ? 'button' : undefined} aria-expanded={onToggle ? String(!collapsed) : undefined}>
        <div>
          <h3 className="text-lg font-semibold">All set - now let’s prep your event</h3>
          <p className="text-[11px] text-white/70 mt-0.5">Keep details tidy so the day runs smoothly.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold bg-white/10 text-white" aria-label={`Prep ${progress.done}/${progress.total}`}>
            Prep {progress.done}/{progress.total}
          </span>
          <SavedPill saving={savingStd} saved={savedStd} />
          {daysToGo !== null && (
            <span className="text-xs text-white/70" aria-label={`In ${daysToGo} days`}>In {daysToGo} days</span>
          )}
        </div>
      </div>

      {!collapsed && (
      <>
      <div className="mt-4 space-y-2 text-sm">
        {/* Provider-first: Schedule then Tech, else Client-first: Contact then Location */}
        {isProvider ? (
          <>
            {/* Load-in window (You) */}
            <div className="rounded-xl border border-[#1F232B]/80 bg-white/5 p-3 flex items-center gap-3">
              <Tick done={done_loadin} />
              <div className="flex-1 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-white/10">You</span>
                <input id="loadin-start" type="time" placeholder="Start HH:MM" className="rounded-md bg-white/10 border border-white/20 text-white placeholder-white/50 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-white/30" value={loadinStart} onChange={(e) => setLoadinStart(e.target.value)} disabled={!canEdit} />
                <input id="loadin-end" type="time" placeholder="End HH:MM" className="rounded-md bg-white/10 border border-white/20 text-white placeholder-white/50 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-white/30" value={loadinEnd} onChange={(e) => setLoadinEnd(e.target.value)} disabled={!canEdit} />
                <button type="button" className="rounded-md bg-white text-gray-900 hover:bg-gray-100 px-3 py-2 text-sm font-medium disabled:opacity-60" onClick={() => loadinStart && loadinEnd && patch({ loadin_start: loadinStart, loadin_end: loadinEnd } as any)} disabled={!canEdit || !loadinStart || !loadinEnd || saving}>Save</button>
              </div>
            </div>

            {/* Tech ownership (display only) */}
            <div className="rounded-xl border border-[#1F232B]/80 bg-white/5 p-3 flex items-center gap-3">
              <Tick done={done_tech} />
              <div className="flex-1">
                <div className="inline-flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-white/10">You</span>
                  <span className="inline-flex items-center rounded-md bg-white/10 px-2 py-1 text-[12px] font-medium text-white">{ep.tech_owner === 'artist' ? 'Artist brings PA' : 'Venue system'}</span>
                  <span className="text-[11px] text-white/60">(set during booking)</span>
                </div>
              </div>
            </div>

            {/* Contact (Client) */}
            <div className="rounded-xl border border-[#1F232B]/80 bg-white/5 p-3 flex items-center gap-3">
              <Tick done={done_contact} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1"><span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-white/10">Client</span></div>
                <div className="flex gap-2">
                  <input id="contact-name" type="text" placeholder="Full name" className="flex-1 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/50 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-white/30" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
                  <input id="contact-phone" type="tel" placeholder="Mobile" className="w-40 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/50 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-white/30" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canEdit} />
                  <button type="button" className="rounded-md bg-white text-gray-900 hover:bg-gray-100 px-3 py-2 text-sm font-medium disabled:opacity-60" onClick={() => name && phone && patch({ day_of_contact_name: name, day_of_contact_phone: phone })} disabled={!canEdit || !name || !phone || saving}>Save</button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Day-of contact (You) */}
            <div className="rounded-xl border border-[#1F232B]/80 bg-white/5 p-3 flex items-center gap-3">
              <Tick done={done_contact} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1"><span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-white/10">You</span></div>
                <div className="flex gap-2">
                  <input id="contact-name" type="text" placeholder="Full name" className="flex-1 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/50 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-white/30" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
                  <input id="contact-phone" type="tel" placeholder="Mobile" className="w-40 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/50 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-white/30" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canEdit} />
                  <button type="button" className="rounded-md bg-white text-gray-900 hover:bg-gray-100 px-3 py-2 text-sm font-medium disabled:opacity-60" onClick={() => name && phone && patch({ day_of_contact_name: name, day_of_contact_phone: phone })} disabled={!canEdit || !name || !phone || saving}>Save</button>
                </div>
              </div>
            </div>

            {/* Venue address (You) */}
            <div className="rounded-xl border border-[#1F232B]/80 bg-white/5 p-3 flex items-center gap-3">
              <Tick done={done_venue} />
              <div className="flex-1 flex items-center justify-between gap-2">
                <div className="truncate">
                  <div className="flex items-center gap-2 text-white/90"><span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-white/10">You</span><span>Venue address</span></div>
                  <div className="text-[12px] text-white/70 truncate">{ep.venue_address || 'Add this on the event page'}</div>
                </div>
                {(ep.venue_lat != null && ep.venue_lng != null) && (
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ep.venue_address || ''}`)}`} target="_blank" rel="noopener noreferrer" className="rounded-md bg-white/10 border border-white/20 text-white px-2 py-1 text-[12px] hover:bg-white/20">Open in Maps</a>
                )}
              </div>
            </div>
          </>
        )}

        {/* Stage power removed per request */}

        {/* Balance acknowledged (derived) */}
        <div className="rounded-xl border border-[#1F232B]/80 bg-white/5 p-3 flex items-center gap-3">
          <Tick done={done_paid} />
          <div className="flex-1 text-white/90">
            Balance acknowledged <span className="text-[12px] text-white/70">{done_paid ? 'Paid ✔' : 'Pending'}</span>
          </div>
        </div>

        {/* Accommodation summary (optional) */}
        <div className="rounded-xl border border-[#1F232B]/80 bg-white/5 p-3 flex items-center gap-3 opacity-90">
          <div className="w-5 h-5 rounded border border-white/30" aria-hidden />
          <div className="flex-1">
            <div className="text-white/90">Accommodation</div>
            <div className="text-[12px] text-white/70">
              {ep.accommodation_required
                ? (ep.accommodation_address || ep.accommodation_contact || ep.accommodation_notes || 'Required (details pending)')
                : 'Not required'}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          className="rounded-md bg-white text-gray-900 hover:bg-gray-100 px-4 py-2 text-sm font-medium"
          onClick={() => onContinuePrep ? onContinuePrep(bookingId) : router.push(`/dashboard/events/${bookingId}`)}
        >
          Continue prep
        </button>
      </div>
      </>
      )}
    </section>
  );
};

export default EventPrepCard;
