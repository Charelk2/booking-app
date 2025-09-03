"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import Link from 'next/link';

import { EventPrep } from '@/types';
import { getEventPrep, updateEventPrep } from '@/lib/api';
import SavedPill from '@/components/ui/SavedPill';
import useSavedHint from '@/hooks/useSavedHint';
import useWebSocket from '@/hooks/useWebSocket';
import { useAuth } from '@/contexts/AuthContext';
import {
  UserIcon,
  PhoneIcon,
  MapPinIcon,
  ClockIcon,
  WrenchScrewdriverIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  HomeModernIcon,
} from '@heroicons/react/24/outline';

type EventPrepCardProps = {
  bookingId: number;
  bookingRequestId: number;
  eventDateISO?: string;
  canEdit: boolean;
  onContinuePrep?: (bookingId: number) => void;
  /** If true, show only the compact summary header (no details). */
  summaryOnly?: boolean;
};

type PrepStep = {
  key: string;
  done?: boolean;
  icon: React.ReactNode;
  owner?: 'You' | 'Client';
  body: React.ReactNode;
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

const IconWrap: React.FC<{ done?: boolean; children?: React.ReactNode }> = ({ done, children }) => (
  <div
    className={
      done
        ? 'relative z-10 grid h-8 w-8 place-items-center rounded-full bg-emerald-50 ring-2 ring-emerald-300 text-emerald-600'
        : 'relative z-10 grid h-8 w-8 place-items-center rounded-full bg-gray-100 ring-1 ring-gray-200 text-gray-600'
    }
    aria-hidden
  >
    {children}
  </div>
);

const EventPrepCard: React.FC<EventPrepCardProps> = ({ bookingId, bookingRequestId, eventDateISO, canEdit, onContinuePrep, summaryOnly }) => {
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
  const { token: authToken } = useAuth();
  // Prefer auth context; fall back to storage if present. If no token, omit the
  // query param entirely so the backend can authenticate via cookies.
  const token = useMemo(() => {
    const t = authToken || (typeof window !== 'undefined' ? (localStorage.getItem('token') || sessionStorage.getItem('token') || null) : null);
    return (t && t.trim().length > 0) ? t : null;
  }, [authToken]);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const wsBase = apiBase.replace(/^http/, 'ws');
  const [wsUrl, setWsUrl] = useState<string>(() => `${wsBase}/api/v1/ws/booking-requests/${bookingRequestId}`);
  useEffect(() => {
    const base = `${wsBase}/api/v1/ws/booking-requests/${bookingRequestId}`;
    if (token) {
      setWsUrl(`${base}?token=${encodeURIComponent(token)}`);
      return;
    }
    // Try to mint a short-lived access token via refresh cookies
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        if (!res.ok) { setWsUrl(base); return; }
        const body = await res.json().catch(() => null);
        const at = body?.access_token as string | undefined;
        if (at && !cancelled) setWsUrl(`${base}?token=${encodeURIComponent(at)}`);
        else if (!cancelled) setWsUrl(base);
      } catch { if (!cancelled) setWsUrl(base); }
    })();
    return () => { cancelled = true; };
  }, [wsBase, bookingRequestId, token]);
  const { onMessage: onSocketMessage } = useWebSocket(wsUrl);

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

  // If the prep record isn't loaded yet (or not created yet), still render
  // a minimal CTA so users can reach the event prep form immediately.
  if (!ep) {
    return (
      <section
        className={summaryOnly ? 'rounded-xl border border-gray-200 bg-green-400 text-gray-900 p-3 cursor-pointer' : 'rounded-2xl shadow border border-gray-200 bg-indigo-50   text-gray-900 p-5 cursor-pointer'}
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
            <p className={summaryOnly ? 'text-[10px] text-gray-800 mt-0.5' : 'text-[11px] text-gray-800 mt-0.5'}>
              A quick checklist to keep the day smooth.
            </p>
          </div>
          {/* Minimal placeholder meta while loading */}
          <div className="flex flex-col items-end gap-1">
            <span className={summaryOnly ? 'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold bg-white text-gray-700' : 'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold bg-gray-100 text-gray-700'}>
              Prep —
            </span>
          </div>
        </div>
      </section>
    );
  }

  // Build the ordered checklist steps according to role
  const stepsBase: PrepStep[] = (
    isProvider
      ? ([
          {
            key: 'loadin',
            done: done_loadin,
            icon: <ClockIcon className="h-4 w-4" />,
            owner: 'You',
            body: (
              <div className="flex flex-wrap items-center gap-2">
                <input id="loadin-start" type="time" placeholder="Start HH:MM" className="rounded-md bg-white border border-gray-300 text-gray-900 placeholder-gray-400 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300" value={loadinStart} onChange={(e) => setLoadinStart(e.target.value)} disabled={!canEdit} />
                <input id="loadin-end" type="time" placeholder="End HH:MM" className="rounded-md bg-white border border-gray-300 text-gray-900 placeholder-gray-400 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300" value={loadinEnd} onChange={(e) => setLoadinEnd(e.target.value)} disabled={!canEdit} />
                <button type="button" className="rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 px-3 py-2 text-sm font-medium disabled:opacity-60" onClick={() => loadinStart && loadinEnd && patch({ loadin_start: loadinStart, loadin_end: loadinEnd } as any)} disabled={!canEdit || !loadinStart || !loadinEnd || saving}>Save</button>
              </div>
            ),
          } as PrepStep,
          {
            key: 'tech',
            done: done_tech,
            icon: <WrenchScrewdriverIcon className="h-4 w-4" />,
            owner: 'You',
            body: (
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-[12px] font-medium text-gray-800">{ep.tech_owner === 'artist' ? 'Artist brings PA' : 'Venue system'}</span>
                <span className="text-[11px] text-gray-500">(set during booking)</span>
              </div>
            ),
          } as PrepStep,
          {
            key: 'contact',
            done: done_contact,
            icon: <PhoneIcon className="h-4 w-4" />,
            owner: 'Client',
            body: (
              <div className="flex flex-wrap gap-2">
                <input id="contact-name" type="text" placeholder="Full name" className="flex-1 min-w-[180px] rounded-md bg-white border border-gray-300 text-gray-900 placeholder-gray-400 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
                <input id="contact-phone" type="tel" placeholder="Mobile" className="w-40 rounded-md bg-white border border-gray-300 text-gray-900 placeholder-gray-400 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canEdit} />
                <button type="button" className="rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 px-3 py-2 text-sm font-medium disabled:opacity-60" onClick={() => name && phone && patch({ day_of_contact_name: name, day_of_contact_phone: phone })} disabled={!canEdit || !name || !phone || saving}>Save</button>
              </div>
            ),
          } as PrepStep,
        ])
      : ([
          {
            key: 'contact',
            done: done_contact,
            icon: <UserIcon className="h-4 w-4" />,
            owner: 'You',
            body: (
              <div className="flex flex-wrap gap-2">
                <input id="contact-name" type="text" placeholder="Full name" className="flex-1 min-w-[180px] rounded-md bg-white border border-gray-300 text-gray-900 placeholder-gray-400 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
                <input id="contact-phone" type="tel" placeholder="Mobile" className="w-40 rounded-md bg-white border border-gray-300 text-gray-900 placeholder-gray-400 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canEdit} />
                <button type="button" className="rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 px-3 py-2 text-sm font-medium disabled:opacity-60" onClick={() => name && phone && patch({ day_of_contact_name: name, day_of_contact_phone: phone })} disabled={!canEdit || !name || !phone || saving}>Save</button>
              </div>
            ),
          } as PrepStep,
          {
            key: 'venue',
            done: done_venue,
            icon: <MapPinIcon className="h-4 w-4" />,
            owner: 'You',
            body: (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-gray-900">Venue address</div>
                  <div className="text-[12px] text-gray-500 truncate">{ep.venue_address || 'Add this on the event page'}</div>
                </div>
                {(ep.venue_lat != null && ep.venue_lng != null) && (
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ep.venue_address || ''}`)}`} target="_blank" rel="noopener noreferrer" className="rounded-md border border-gray-300 bg-white text-gray-700 px-2 py-1 text-[12px] hover:bg-gray-50">Open in Maps</a>
                )}
              </div>
            ),
          } as PrepStep,
        ])
  );

  const stepsList: PrepStep[] = stepsBase.concat([
    {
      key: 'balance',
      done: done_paid,
      icon: <CurrencyDollarIcon className="h-4 w-4" />,
      body: (
        <div className="text-gray-900">
          Balance acknowledged <span className="text-[12px] text-gray-500">{done_paid ? 'Paid ✔' : 'Pending'}</span>
        </div>
      ),
    } as PrepStep,
  ]);

  return (
    <section
      className={summaryOnly ? 'rounded-xl border border-gray-200 bg-green-400 text-gray-900 p-3 cursor-pointer' : 'rounded-2xl shadow border border-gray-200 bg-indigo-50   text-gray-900 p-5 cursor-pointer'}
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
          <p className={summaryOnly ? 'text-[10px] text-gray-800 mt-0.5' : 'text-[11px] text-gray-800 mt-0.5'}>A quick checklist to keep the day smooth.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={summaryOnly ? 'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold bg-white text-gray-700' : 'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold bg-gray-100 text-gray-700'} aria-label={`Prep ${progress.done}/${progress.total}`}>
            Prep {progress.done}/{progress.total}
          </span>
          {!summaryOnly && <SavedPill saving={savingStd} saved={savedStd} />}
          {daysToGo !== null && (
            <span className={summaryOnly ? 'text-[10px] text-gray-800' : 'text-xs text-gray-800'} aria-label={`In ${daysToGo} days`}>In {daysToGo} days</span>
          )}
        </div>
      </div>

      {/* Details hidden in summary-only mode */}
      {!summaryOnly && (
        <>
          <div className="mt-5 grid gap-4">
            <div className="relative pl-8">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" aria-hidden />
              <div className="space-y-4 text-sm">
                {stepsList.map((step, idx, arr) => (
                  <div key={step.key} className="relative flex items-start gap-3">
                    {idx !== 0 && <div className="absolute left-4 -top-4 h-4 w-px bg-gray-200" aria-hidden />}
                    {idx !== arr.length - 1 && <div className="absolute left-4 top-8 -bottom-4 w-px bg-gray-200" aria-hidden />}

                    <IconWrap done={step.done}>
                      {step.done ? <CheckCircleIcon className="h-4 w-4" /> : step.icon}
                    </IconWrap>
                    <div className="flex-1 rounded-xl border border-gray-200 bg-white p-3" onClick={(e) => e.stopPropagation()}>
                      <div className="mb-1 flex items-center gap-2">
                        {step.owner && (
                          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-gray-100 text-gray-600">{step.owner}</span>
                        )}
                      </div>
                      {step.body}
                    </div>
                  </div>
                ))}

                <div className="relative flex items-start gap-3 opacity-90">
                  <div className="absolute left-4 -top-4 h-4 w-px bg-gray-200" aria-hidden />
                  <div className="absolute left-4 top-8 -bottom-4 w-px bg-gray-200" aria-hidden />
                  <IconWrap>
                    <HomeModernIcon className="h-4 w-4" />
                  </IconWrap>
                  <div className="flex-1 rounded-xl border border-gray-200 bg-white p-3" onClick={(e) => e.stopPropagation()}>
                    <div className="text-gray-900">Accommodation</div>
                    <div className="text-[12px] text-gray-500">
                      {ep.accommodation_required
                        ? (ep.accommodation_address || ep.accommodation_contact || ep.accommodation_notes || 'Required (details pending)')
                        : 'Not required'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              className="rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 px-4 py-2 text-sm font-medium"
              onClick={(e) => { e.stopPropagation(); onContinuePrep ? onContinuePrep(bookingId) : router.push(`/dashboard/events/${bookingId}`); }}
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
