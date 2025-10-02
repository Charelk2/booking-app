// Your InboxPage.tsx
'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AxiosResponse } from 'axios';
import MainLayout from '@/components/layout/MainLayout';
// Corrected import path for AuthContext (assuming it's directly in contexts)
import { useAuth } from '@/contexts/AuthContext';
import { emitThreadsUpdated, type ThreadsUpdatedDetail } from '@/lib/threadsEvents';
import { Spinner } from '@/components/ui';
import ConversationList from '@/components/inbox/ConversationList';
import dynamic from 'next/dynamic';
const MessageThreadWrapper = dynamic(() => import('@/components/inbox/MessageThreadWrapper'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-500 text-center p-4">
      <Spinner />
    </div>
  ),
});
import ReviewFormModal from '@/components/review/ReviewFormModal';
import {
  getThreadsIndex,
  getMessagesForBookingRequest,
  ensureBookaThread,
  getMyBookingRequests,
  getBookingRequestsForArtist,
  markThreadRead,
  getMessageThreads,
  getMessageThreadsPreview,
} from '@/lib/api';
import { useTransportState } from '@/hooks/useTransportState';
import {
  isOfflineError,
  isTransientTransportError,
  runWithTransport,
} from '@/lib/transportState';
import { BREAKPOINT_MD } from '@/lib/breakpoints';
import { BookingRequest } from '@/types';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import useUnreadThreadsCount from '@/hooks/useUnreadThreadsCount';
import { writeThreadCache } from '@/lib/threadCache';
import {
  initThreadPrefetcher,
  resetThreadPrefetcher,
  enqueueThreadPrefetch,
  setActivePrefetchThread,
  markThreadAsStale,
  kickThreadPrefetcher,
} from '@/lib/threadPrefetcher';
import type { PrefetchCandidate } from '@/lib/threadPrefetcher';
import { recordThreadSwitchStart } from '@/lib/inboxTelemetry';
import OfflineBanner from '@/components/inbox/OfflineBanner';
// Telemetry flags removed; keep code minimal

export default function InboxPage() {
  const { user, loading: authLoading } = useAuth();
  const [allBookingRequests, setAllBookingRequests] = useState<BookingRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [selectedBookingRequestId, setSelectedBookingRequestId] = useState<number | null>(null);
  const [hydratedThreadIds, setHydratedThreadIds] = useState<number[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < BREAKPOINT_MD : false,
  );
  const [showList, setShowList] = useState(true);
  const [query, setQuery] = useState('');
  const [listHeight, setListHeight] = useState<number>(0);
  // Ensure we only attempt to create a Booka thread once per mount
  const ensureTriedRef = useRef(false);
  // Debounce focus/visibility-triggered refreshes
  const lastRefreshAtRef = useRef<number>(0);
  // Header unread badge (live)
  const { count: unreadTotal } = useUnreadThreadsCount(30000);
  const transport = useTransportState();
  const fetchTaskId = useMemo(
    () => `inbox-threads:${user?.id ?? 'anon'}`,
    [user?.id],
  );

  useEffect(() => {
    if (selectedBookingRequestId === null) return;
    setHydratedThreadIds((prev) => {
      const next = [
        selectedBookingRequestId,
        ...prev.filter((id) => id !== selectedBookingRequestId),
      ];
      // Keep current + most recent previous thread hydrated
      return next.slice(0, 2);
    });
  }, [selectedBookingRequestId]);

  useEffect(() => {
    setActivePrefetchThread(selectedBookingRequestId ?? null);
  }, [selectedBookingRequestId]);

  // If not authenticated, send to login early and avoid firing API calls
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      try {
        const next = encodeURIComponent('/inbox');
        window.location.replace(`/auth?intent=login&next=${next}`);
      } catch {}
    }
  }, [authLoading, user]);

  // Preload the chat thread chunk after mount to avoid first-open lag
  useEffect(() => {
    if (authLoading || !user) return; // wait for auth before fetching anything
    try {
      const schedule = (fn: () => void) => {
        const ric = (window as any)?.requestIdleCallback as ((cb: () => void, opts?: any) => void) | undefined;
        if (typeof ric === 'function') ric(fn, { timeout: 800 });
        else setTimeout(fn, 200);
      };
      schedule(() => { void import('@/components/inbox/MessageThreadWrapper'); });
    } catch {}
  }, []);

  // Fast session cache for instant render on return navigations
  const CACHE_KEY = useMemo(() => {
    const role = user?.user_type === 'service_provider' ? 'artist' : 'client';
    const uid = user?.id ? String(user.id) : 'anon';
    return `inbox:threadsCache:v2:${role}:${uid}`;
  }, [user?.user_type, user?.id]);
  const LATEST_CACHE_KEY = 'inbox:threadsCache:latest';
  // Persist across full reloads/tab closes; keep for 24h by default
  const PERSIST_TTL_MS = 24 * 60 * 60 * 1000;
  const persistKey = useMemo(() => `${CACHE_KEY}:persist`, [CACHE_KEY]);
  // Persist selected conversation across reloads
  const SEL_KEY = useMemo(() => `${CACHE_KEY}:selected`, [CACHE_KEY]);

  // Bootstrap from cache immediately for snappy paint
  useEffect(() => {
    if (authLoading || !user) return; // guard unauthenticated

    if (!transport.online) {
      if (allBookingRequests.length === 0) setLoadingRequests(false);
      setError(null);
      runWithTransport(
        fetchTaskId,
        () => fetchAllRequests(),
        {
          metadata: {
            type: 'threads-index',
            scope: 'inbox',
            retryReason: 'offline',
          },
        },
      );
      return;
    }

    if (allBookingRequests.length === 0) setLoadingRequests(true);
    try {
      if (typeof window === 'undefined') return;
      // 1) Prefer session cache (fastest, always safe)
      const sessionCached = sessionStorage.getItem(CACHE_KEY) || sessionStorage.getItem(LATEST_CACHE_KEY);
      if (sessionCached) {
        const parsed = JSON.parse(sessionCached) as BookingRequest[];
        if (Array.isArray(parsed) && parsed.length) setAllBookingRequests(parsed);
        return;
      }
      // 2) Fall back to persistent cache (survives hard reloads). Validate TTL.
      const raw = localStorage.getItem(persistKey);
      if (raw) {
        const obj = JSON.parse(raw) as { ts: number; items: BookingRequest[] };
        if (obj && Array.isArray(obj.items) && obj.items.length > 0) {
          const age = Date.now() - Number(obj.ts || 0);
          if (age >= 0 && age < PERSIST_TTL_MS) {
            setAllBookingRequests(obj.items);
            // hydrate session for the rest of this tab's life
            try {
              const json = JSON.stringify(obj.items);
              sessionStorage.setItem(CACHE_KEY, json);
              sessionStorage.setItem(LATEST_CACHE_KEY, json);
            } catch {}
          } else {
            // stale — clear it
            try { localStorage.removeItem(persistKey); } catch {}
          }
        }
      }
    } catch {}
  }, [CACHE_KEY, LATEST_CACHE_KEY, PERSIST_TTL_MS, persistKey]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < BREAKPOINT_MD);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Measure available height for the conversation list so it scrolls within the pane
  // Use layout effect to ensure the first paint already has a bounded height.
  useLayoutEffect(() => {
    const el = document.getElementById('conversation-list-body');
    if (!el) return;
    const compute = () => setListHeight(el.clientHeight || 0);
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, []);

  const fetchAllRequests = useCallback(async () => {
    // Small helper: timeout wrapper to avoid long hangs on slow networks
    const withTimeout = <T,>(p: Promise<T>, ms = 3000, fallback?: T): Promise<T> => {
      return new Promise<T>((resolve) => {
        const to = setTimeout(() => resolve(fallback as T), ms);
        p.then((v) => { clearTimeout(to); resolve(v); }).catch(() => { clearTimeout(to); resolve(fallback as T); });
      });
    };
    // Try unified threads index first (fast, server-joined). Fall back quickly if slow.
    if (authLoading || !user) return; // guard unauthenticated
    try {
      const role = user?.user_type === 'service_provider' ? 'artist' : 'client';
      const res = await withTimeout(getThreadsIndex(role as any, 50), 3500, { data: { items: [] } } as any);
      const items = (res?.data?.items || []) as any[];
      // If index is empty (timeout or no data), try preview for a quick first paint
      if (!items.length && allBookingRequests.length === 0) {
        try {
          const prev = await withTimeout(getMessageThreadsPreview(role as any, 50), 2500, { data: { items: [] } } as any);
          const pitems = (prev?.data?.items || []) as any[];
          if (pitems.length) {
            const isArtist = user?.user_type === 'service_provider';
            const mapped: BookingRequest[] = pitems.map((it: any) => ({
              id: Number(it.thread_id || it.booking_request_id || it.id),
              client_id: 0 as any,
              service_provider_id: 0 as any,
              status: (it.state as any) || 'pending_quote',
              created_at: it.last_ts || it.last_message_at,
              updated_at: it.last_ts || it.last_message_at,
              last_message_content: (it.last_message_preview || it.last_message_snippet || ''),
              last_message_timestamp: it.last_ts || it.last_message_at,
              is_unread_by_current_user: Number((it.unread_count || 0)) > 0 as any,
              unread_count: Number(it.unread_count || 0) as any,
              message: null,
              travel_mode: null,
              travel_cost: null,
              travel_breakdown: null,
              proposed_datetime_1: null,
              proposed_datetime_2: null,
              attachment_url: null,
              service_id: undefined,
              service: undefined,
              artist: undefined as any,
              artist_profile: (!isArtist ? ({ business_name: (it.counterparty_name || (it.counterparty?.name) || ''), profile_picture_url: (it.counterparty_avatar_url || (it.counterparty?.avatar_url) || undefined) } as any) : undefined),
              client: (isArtist ? ({ first_name: (it.counterparty_name || (it.counterparty?.name) || ''), profile_picture_url: (it.counterparty_avatar_url || (it.counterparty?.avatar_url) || undefined) } as any) : undefined),
              accepted_quote_id: null,
              sound_required: undefined as any,
              ...(((it.counterparty_name || (it.counterparty?.name)) === 'Booka') ? { is_booka_synthetic: true } : {}),
            } as any));
            mapped.sort((a, b) => new Date(String((b as any).last_message_timestamp || b.updated_at || b.created_at)).getTime() -
                                    new Date(String((a as any).last_message_timestamp || a.updated_at || a.created_at)).getTime());
            setAllBookingRequests(mapped);
            try {
              const json = JSON.stringify(mapped);
              sessionStorage.setItem(CACHE_KEY, json);
              sessionStorage.setItem(LATEST_CACHE_KEY, json);
              localStorage.setItem(persistKey, JSON.stringify({ ts: Date.now(), items: mapped }));
            } catch {}
          }
        } catch {}
      }
      // If index returned items, use them now for instant list
      if (items.length) {
      const isArtist = user?.user_type === 'service_provider';
      const mapped: BookingRequest[] = items.map((it: any) => ({
        id: Number(it.thread_id || it.booking_request_id || it.id),
        client_id: 0 as any,
        service_provider_id: 0 as any,
        status: (it.state as any) || 'pending_quote',
        created_at: it.last_message_at,
        updated_at: it.last_message_at,
        last_message_content: it.last_message_snippet,
        last_message_timestamp: it.last_message_at,
        is_unread_by_current_user: (it.unread_count || 0) > 0 as any,
        unread_count: Number(it.unread_count || 0) as any,
        message: null,
        travel_mode: null,
        travel_cost: null,
        travel_breakdown: null,
        proposed_datetime_1: (it.meta as any)?.event_date || null,
        proposed_datetime_2: null,
        attachment_url: null,
        service_id: undefined,
        service: undefined,
        artist: undefined as any,
        artist_profile: (!isArtist ? ({ business_name: (it.counterparty_name || (it.counterparty?.name) || ''), profile_picture_url: (it.counterparty_avatar_url || (it.counterparty?.avatar_url) || undefined) } as any) : undefined),
        client: (isArtist ? ({ first_name: (it.counterparty_name || (it.counterparty?.name) || ''), profile_picture_url: (it.counterparty_avatar_url || (it.counterparty?.avatar_url) || undefined) } as any) : undefined),
        accepted_quote_id: null,
        sound_required: undefined as any,
        ...(it.counterparty_name === 'Booka' ? { is_booka_synthetic: true } : {}),
        ...(it.state ? { thread_state: it.state } : {}),
      } as any));
      // Sort newest to oldest by last activity
      mapped.sort((a, b) => new Date(String((b as any).last_message_timestamp || b.updated_at || b.created_at)).getTime() -
                              new Date(String((a as any).last_message_timestamp || a.updated_at || a.created_at)).getTime());
      setAllBookingRequests(mapped);
      try {
        const json = JSON.stringify(mapped);
        sessionStorage.setItem(CACHE_KEY, json);
        sessionStorage.setItem(LATEST_CACHE_KEY, json);
        localStorage.setItem(persistKey, JSON.stringify({ ts: Date.now(), items: mapped }));
      } catch {}
      setError(null);
      setLoadingRequests(false);
      return;
      }
    } catch (e) {
      // fall through to legacy merge path
    }
    if (authLoading || !user) return; // guard unauthenticated
    try {
      const mineRes = await getMyBookingRequests();
      let artistRes: AxiosResponse<BookingRequest[]> = { data: [] } as unknown as AxiosResponse<BookingRequest[]>;
      if (user?.user_type === 'service_provider') {
        artistRes = await getBookingRequestsForArtist();
      }
      let combined = [...mineRes.data, ...artistRes.data].reduce<BookingRequest[]>((acc, req) => {
        if (!acc.find((r) => r.id === req.id)) acc.push(req);
        return acc;
      }, []);

      // Merge unread status from message-threads endpoint to ensure UI reflects reality
      try {
        const t = await getMessageThreads();
        const unreadSet = new Set<number>();
        (t.data || []).forEach((th) => {
          if ((th as any).booking_request_id && Number(th.unread_count || 0) > 0) {
            unreadSet.add(Number((th as any).booking_request_id));
          }
        });
        combined = combined.map((r) => ({
          ...r,
          is_unread_by_current_user:
            ((r as any).is_unread_by_current_user === true || (r as any).is_unread_by_current_user === 1 || (r as any).is_unread_by_current_user === '1' || (r as any).is_unread_by_current_user === 'true')
              ? true
              : unreadSet.has(r.id),
        }));
      } catch (e) {
        // best-effort; ignore errors and show existing flags
      }
      // Overlay moderation previews from the threads preview endpoint directly onto existing rows (non-blocking)
      try {
        const role = user?.user_type === 'service_provider' ? 'artist' : 'client';
        const preview = await getMessageThreadsPreview(role as any, 50);
        const items = preview.data?.items || [];
        if (items.length > 0) {
          const byId = new Map<number, BookingRequest>(combined.map((r) => [r.id, r] as [number, BookingRequest]));
          for (const it of items) {
            const id = (it as any).thread_id as number;
            const r = byId.get(id);
            if (!r) continue;
            const text = String(it.last_message_preview || '');
            const isBooka = String((it as any).counterparty?.name || '') === 'Booka' || /^(\s*listing\s+approved:|\s*listing\s+rejected:)/i.test(text);
            // Always capture thread state from preview for row logic (e.g., hide INQUIRY once requested)
            (r as any).thread_state = (it as any).state || null;
            // Optionally mirror unread count for accuracy
            (r as any).unread_count = (it as any).unread_count ?? (r as any).unread_count;
            if (isBooka) {
              (r as any).last_message_content = it.last_message_preview;
              (r as any).last_message_timestamp = it.last_ts;
              (r as any).is_booka_synthetic = true; // hint for Booka display
            }
          }
          // If we have no booking requests yet, synthesize rows from previews so Booka appears in Inbox
          if (combined.length === 0) {
            const synth: BookingRequest[] = [] as any;
            for (const it of items) {
              const text = String(it.last_message_preview || '');
              const isBooka = String((it as any).counterparty?.name || '') === 'Booka' || /^(\s*listing\s+approved:|\s*listing\s+rejected:)/i.test(text);
              if (!isBooka) continue;
              const id = (it as any).thread_id as number;
              synth.push({
                id,
                client_id: 0,
                service_provider_id: 0 as any,
                status: 'pending_quote' as any,
                created_at: String(it.last_ts || new Date().toISOString()),
                updated_at: String(it.last_ts || new Date().toISOString()),
                last_message_content: 'Booka update',
                last_message_timestamp: it.last_ts,
                is_unread_by_current_user: true as any,
                message: null,
                travel_mode: null,
                travel_cost: null,
                travel_breakdown: null,
                proposed_datetime_1: null,
                proposed_datetime_2: null,
                attachment_url: null,
                service_id: undefined,
                service: undefined,
                artist: undefined as any,
                artist_profile: undefined as any,
                client: undefined as any,
                accepted_quote_id: null,
                sound_required: undefined as any,
                // Hints for UI overrides
                ...( { is_booka_synthetic: true, thread_state: (it as any).state || null } as any ),
              } as any);
            }
            if (synth.length > 0) {
              synth.sort((a, b) => new Date(String((b as any).last_message_timestamp || b.updated_at || b.created_at)).getTime() -
                                     new Date(String((a as any).last_message_timestamp || a.updated_at || a.created_at)).getTime());
              combined = synth;
            }
          }
        }
      } catch {}

      // Secondary zero-state fallback: synthesize from message thread notifications
      if (combined.length === 0) {
        try {
          const t = await getMessageThreads();
          const items = (t.data || []) as any[];
          const synth: BookingRequest[] = [] as any;
          for (const th of items) {
            const id = Number((th as any).booking_request_id);
            if (!id) continue;
            const text = String(th.last_message || '').trim();
            const last_ts = String(th.timestamp || new Date().toISOString());
            const isBooka = /^\s*listing\s+(approved|rejected)\s*:/i.test(text);
            synth.push({
              id,
              client_id: 0,
              service_provider_id: 0 as any,
              status: 'pending_quote' as any,
              created_at: last_ts,
              updated_at: last_ts,
              last_message_content: isBooka ? 'Booka update' : text,
              last_message_timestamp: last_ts,
              is_unread_by_current_user: Number(th.unread_count || 0) > 0,
              message: null,
              travel_mode: null,
              travel_cost: null,
              travel_breakdown: null,
              proposed_datetime_1: null,
              proposed_datetime_2: null,
              attachment_url: null,
              service_id: undefined,
              service: undefined,
              artist: undefined as any,
              artist_profile: undefined as any,
              client: undefined as any,
              accepted_quote_id: null,
              sound_required: undefined as any,
              ...( isBooka ? { is_booka_synthetic: true } : {} ),
            } as any);
          }
          if (synth.length > 0) {
            synth.sort((a, b) => new Date(String((b as any).last_message_timestamp || b.updated_at || b.created_at)).getTime() -
                                   new Date(String((a as any).last_message_timestamp || a.updated_at || a.created_at)).getTime());
            combined = synth;
          }
        } catch {}
      }

      // Fallback: if preview overlay missed, inspect a few last chat messages for recent threads (best-effort, idle)
      try {
        const base = [...combined];
        const schedule = (fn: () => void) => {
          try {
            const ric = (window as any)?.requestIdleCallback as ((cb: () => void, opts?: any) => void) | undefined;
            if (typeof ric === 'function') ric(fn, { timeout: 1000 });
            else setTimeout(fn, 0);
          } catch { setTimeout(fn, 0); }
        };
        schedule(async () => {
          try {
            const sample = [...base]
              .sort((a, b) => new Date(String((b as any).last_message_timestamp ?? b.updated_at ?? b.created_at)).getTime() -
                              new Date(String((a as any).last_message_timestamp ?? a.updated_at ?? a.created_at)).getTime())
              .slice(0, 6);
            const results = await Promise.allSettled(
              sample.map(async (r) => {
                const res = await getMessagesForBookingRequest(r.id, { limit: 40, mode: 'lite' });
                const { items: msgs } = res.data;
                // Detect Booka moderation update based on the last message
                const last = msgs[msgs.length - 1];
                let moderation: { id: number; text: string; ts: string } | null = null;
                if (last && last.content) {
                  const text = String(last.content || '').trim();
                  if (/^(listing\s+approved:|listing\s+rejected:)/i.test(text)) {
                    moderation = { id: r.id, text: 'Booka update', ts: last.timestamp } as const;
                  }
                }
                // Detect explicit inquiry card anywhere in the message list
                const hasInquiryCard = Array.isArray(msgs) && msgs.some((m) => {
                  const raw = (m && (m as any).content) ? String((m as any).content) : '';
                  return raw.includes('inquiry_sent_v1');
                });
                return { moderation, hasInquiryCard } as const;
              })
            );
            const found: Array<{ moderation: { id: number; text: string; ts: string } | null; hasInquiryCard: boolean } | null> =
              results.map((r) => r.status === 'fulfilled' ? r.value : null);
            const byId = new Map<number, BookingRequest>(base.map((r) => [r.id, r] as [number, BookingRequest]));
            for (let i = 0; i < sample.length; i++) {
              const res = found[i];
              const r = sample[i];
              if (!res) continue;
              const target = byId.get(r.id);
              if (!target) continue;
              if (res.moderation) {
                (target as any).last_message_content = res.moderation.text;
                (target as any).last_message_timestamp = res.moderation.ts;
                (target as any).is_booka_synthetic = true;
              }
              if (res.hasInquiryCard) {
                (target as any).has_inquiry_card = true;
              }
            }
            const updated = Array.from(byId.values()).sort(
              (a, b) => new Date(String((b as any).last_message_timestamp ?? b.updated_at ?? b.created_at)).getTime() -
                        new Date(String((a as any).last_message_timestamp ?? a.updated_at ?? a.created_at)).getTime(),
            );
            setAllBookingRequests(updated);
            try {
              const json = JSON.stringify(updated);
              sessionStorage.setItem(CACHE_KEY, json);
              sessionStorage.setItem(LATEST_CACHE_KEY, json);
              localStorage.setItem(persistKey, JSON.stringify({ ts: Date.now(), items: updated }));
            } catch {}
          } catch {}
        });
      } catch {}

      combined.sort(
        (a, b) =>
          new Date(String((b as any).last_message_timestamp ?? b.updated_at ?? b.created_at)).getTime() -
          new Date(String((a as any).last_message_timestamp ?? a.updated_at ?? a.created_at)).getTime(),
      );
      setAllBookingRequests(combined);
      try {
        const json = JSON.stringify(combined);
        sessionStorage.setItem(CACHE_KEY, json);
        sessionStorage.setItem(LATEST_CACHE_KEY, json);
        localStorage.setItem(persistKey, JSON.stringify({ ts: Date.now(), items: combined }));
      } catch {}

      // If artist has zero threads, attempt to ensure a Booka thread exists once
      try {
        if (!ensureTriedRef.current && (user?.user_type === 'service_provider') && combined.length === 0) {
          ensureTriedRef.current = true;
          const res = await ensureBookaThread();
          const realId = res.data?.booking_request_id;
          if (realId) {
            // Refetch to include the new thread
            const mineRes2 = await getMyBookingRequests();
            let artistRes2: AxiosResponse<BookingRequest[]> = { data: [] } as unknown as AxiosResponse<BookingRequest[]>;
            try { artistRes2 = await getBookingRequestsForArtist(); } catch {}
            const combined2 = [...mineRes2.data, ...artistRes2.data].reduce<BookingRequest[]>((acc, req) => {
              if (!acc.find((r) => r.id === req.id)) acc.push(req);
              return acc;
            }, []);
            combined2.sort(
              (a, b) =>
                new Date(String((b as any).last_message_timestamp ?? b.updated_at ?? b.created_at)).getTime() -
                new Date(String((a as any).last_message_timestamp ?? a.updated_at ?? a.created_at)).getTime(),
            );
            setAllBookingRequests(combined2);
            try {
              const json = JSON.stringify(combined2);
              sessionStorage.setItem(CACHE_KEY, json);
              sessionStorage.setItem(LATEST_CACHE_KEY, json);
              localStorage.setItem(persistKey, JSON.stringify({ ts: Date.now(), items: combined2 }));
            } catch {}
          }
        }
      } catch {
        // best-effort only
      }
    } catch (err: unknown) {
      console.error('Failed to load booking requests:', err);
      if (isTransientTransportError(err) || isOfflineError(err)) {
        setError(null);
        runWithTransport(
          fetchTaskId,
          () => fetchAllRequests(),
          {
            metadata: {
              type: 'threads-index',
              scope: 'inbox',
              retryReason: isOfflineError(err) ? 'offline' : 'transient',
            },
          },
        );
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load conversations');
      }
    } finally {
      setLoadingRequests(false);
    }
  }, [
    user?.user_type,
    user?.id,
    allBookingRequests.length,
    CACHE_KEY,
    LATEST_CACHE_KEY,
    persistKey,
    authLoading,
    transport.online,
    fetchTaskId,
  ]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace('/login?redirect=/inbox');
      } else {
        fetchAllRequests();
      }
    }
  }, [authLoading, user, router, fetchAllRequests]);

  // Live patch previews from thread events to avoid waiting for a refetch
  useEffect(() => {
    const onPreview = (e: any) => {
      try {
        const detail = (e && e.detail) || {};
        const id = Number(detail.id);
        if (!id) return;
        setAllBookingRequests((prev) => {
          const next = prev.map((r) => {
            if (r.id !== id) return r;
            return {
              ...r,
              last_message_content: String(detail.content || r.last_message_content || ''),
              last_message_timestamp: String(detail.ts || r.last_message_timestamp || r.updated_at || r.created_at),
              is_unread_by_current_user: detail.unread === true ? (true as any) : r.is_unread_by_current_user,
            } as BookingRequest;
          });
          try {
            const json = JSON.stringify(next);
            sessionStorage.setItem(CACHE_KEY, json);
            sessionStorage.setItem(LATEST_CACHE_KEY, json);
            localStorage.setItem(persistKey, JSON.stringify({ ts: Date.now(), items: next }));
          } catch {}
          return next;
        });
      } catch {}
    };
    try { window.addEventListener('thread:preview', onPreview as any); } catch {}
    return () => { try { window.removeEventListener('thread:preview', onPreview as any); } catch {} };
  }, [CACHE_KEY, LATEST_CACHE_KEY, persistKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleMissing = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: number }>).detail || {};
      const id = Number(detail.id);
      if (!id) return;
      setAllBookingRequests((prev) => {
        if (!prev.some((r) => r.id === id)) return prev;
        const next = prev.filter((r) => r.id !== id);
        try {
          const json = JSON.stringify(next);
          sessionStorage.setItem(CACHE_KEY, json);
          sessionStorage.setItem(LATEST_CACHE_KEY, json);
          localStorage.setItem(persistKey, JSON.stringify({ ts: Date.now(), items: next }));
        } catch {}
        return next;
      });
      setSelectedBookingRequestId((current) => (current === id ? null : current));
      try {
        if (sessionStorage.getItem(SEL_KEY) === String(id)) sessionStorage.removeItem(SEL_KEY);
      } catch {}
      try {
        const raw = localStorage.getItem(SEL_KEY);
        if (raw) {
          const obj = JSON.parse(raw) as { id?: number };
          if (obj?.id === id) localStorage.removeItem(SEL_KEY);
        }
      } catch {}
    };
    window.addEventListener('thread:missing', handleMissing as EventListener);
    return () => window.removeEventListener('thread:missing', handleMissing as EventListener);
  }, [CACHE_KEY, LATEST_CACHE_KEY, persistKey, SEL_KEY]);

  // Refresh list on window focus / tab visibility change so previews update (throttled)
  useEffect(() => {
    const onFocus = () => {
      const now = Date.now();
      if (now - lastRefreshAtRef.current > 2000) {
        lastRefreshAtRef.current = now;
        fetchAllRequests();
      }
    };
    const onVisibility = () => {
      const now = Date.now();
      if (document.visibilityState === 'visible' && now - lastRefreshAtRef.current > 2000) {
        lastRefreshAtRef.current = now;
        fetchAllRequests();
      }
    };
    // Also refresh when the chat layer signals updates (e.g., quote sent, payment received)
    const onThreadsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: string; threadId?: number }>).detail || {};
      if (detail.source === 'inbox' && detail.threadId === selectedBookingRequestId) return;
      const now = Date.now();
      if (now - lastRefreshAtRef.current > 1000) {
        lastRefreshAtRef.current = now;
        fetchAllRequests();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('threads:updated', onThreadsUpdated as any);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('threads:updated', onThreadsUpdated as any);
    };
  }, [fetchAllRequests, selectedBookingRequestId]);

  // Select conversation based on URL param after requests load; if none, restore persisted selection
  useEffect(() => {
    if (!allBookingRequests.length) return;
    const isMobileScreen = typeof window !== 'undefined' && window.innerWidth < BREAKPOINT_MD;
    // On mobile, we still restore the selected thread so the thread pane can open when needed
    const urlId = Number(searchParams.get('requestId'));
    const isBooka = Boolean(searchParams.get('booka') || searchParams.get('bookasystem'));
    if (isBooka) {
      // Resolve or create the Booka thread and select it
      (async () => {
        try {
          const res = await ensureBookaThread();
          const realId = res.data?.booking_request_id;
          if (realId && realId !== selectedBookingRequestId) {
            recordThreadSwitchStart(realId, { source: 'system' });
            setSelectedBookingRequestId(realId);
          }
        } catch {}
      })();
      return;
    }
    if (
      urlId &&
      urlId !== selectedBookingRequestId &&
      allBookingRequests.find((r) => r.id === urlId)
    ) {
      recordThreadSwitchStart(urlId, { source: 'restored' });
      setSelectedBookingRequestId(urlId);
    } else if (selectedBookingRequestId == null) {
      // Try restore persisted selection first
      try {
        const rawSession = sessionStorage.getItem(SEL_KEY);
        const rawPersist = localStorage.getItem(SEL_KEY);
        let selId: number | null = null;
        if (rawSession) selId = Number(rawSession);
        else if (rawPersist) {
          try {
            const obj = JSON.parse(rawPersist) as { id?: number; ts?: number };
            const age = Date.now() - Number(obj.ts || 0);
            if (obj.id && age >= 0 && age < PERSIST_TTL_MS) selId = Number(obj.id);
          } catch {}
        }
        if (
          selId &&
          selId !== selectedBookingRequestId &&
          allBookingRequests.find((r) => r.id === selId)
        ) {
          recordThreadSwitchStart(selId, { source: 'restored' });
          setSelectedBookingRequestId(selId);
          return;
        }
      } catch {}
      // Fallback to most recent
      const fallbackId = allBookingRequests[0].id;
      if (fallbackId && fallbackId !== selectedBookingRequestId) {
        recordThreadSwitchStart(fallbackId, { source: 'restored' });
        setSelectedBookingRequestId(fallbackId);
      }
    }
  }, [allBookingRequests, searchParams, selectedBookingRequestId, SEL_KEY, PERSIST_TTL_MS]);

  // List now uses auto height by default; no need to compute a fixed height here.

  const filteredRequests = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allBookingRequests;
    return allBookingRequests.filter((r) => {
      const name = (user?.user_type === 'service_provider'
        ? r.client?.first_name
        : r.artist_profile?.business_name || r.artist?.first_name || '')
        .toString()
        .toLowerCase();
      const preview = (r.last_message_content || r.service?.title || r.message || '')
        .toString()
        .toLowerCase();
      return name.includes(q) || preview.includes(q);
    });
  }, [allBookingRequests, query, user]);

  // Prefetch helper with LRU writes
  const PREFETCH_STALE_MS = 5 * 60 * 1000;
  const PREFETCH_DEFAULT_LIMIT = 80;
  const PREFETCH_CANDIDATE_LIMIT = 15;

  const prefetchThreadMessages = useCallback(async (id: number, limit = PREFETCH_DEFAULT_LIMIT) => {
    if (!id) return;
    try {
      const res = await getMessagesForBookingRequest(id, { limit, mode: 'lite' });
      writeThreadCache(id, res.data.items);
    } catch {}
  }, []);

  useEffect(() => {
    initThreadPrefetcher(prefetchThreadMessages, {
      defaultLimit: PREFETCH_DEFAULT_LIMIT,
      staleMs: PREFETCH_STALE_MS,
    });
    return () => {
      resetThreadPrefetcher();
    };
  }, [prefetchThreadMessages]);

  const handleSelect = useCallback(
    (id: number) => {
      if (!id) return;
      let previousUnread = 0;
      let selectedNow: any = null;
      try {
        selectedNow = allBookingRequests.find((r) => r.id === id) as any;
        previousUnread = Number(selectedNow?.unread_count || 0) || 0;
      } catch {}
      recordThreadSwitchStart(id, { source: 'list_click', unreadBefore: previousUnread });
      // Immediate UI feedback: select and update URL right away
      setSelectedBookingRequestId(id);
      setAllBookingRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? ({
                ...r,
                is_unread_by_current_user: false as any,
                unread_count: 0 as any,
              })
            : r,
        ),
      );
      const isBooka = Boolean(selectedNow?.is_booka_synthetic);
      const params = new URLSearchParams(searchParams.toString());
      if (isBooka) {
        params.delete('requestId');
        params.set('booka', '1');
      } else {
        params.delete('booka');
        params.set('requestId', String(id));
      }
      router.replace(`?${params.toString()}`, { scroll: false });
      try {
        sessionStorage.setItem(SEL_KEY, String(id));
        localStorage.setItem(SEL_KEY, JSON.stringify({ id, ts: Date.now() }));
      } catch {}
      if (isMobile) setShowList(false);

      // Fire-and-forget: mark read, then nudge global counters when done
      try {
        if (previousUnread > 0 && typeof window !== 'undefined') {
          try {
            window.dispatchEvent(
              new CustomEvent('inbox:unread', {
                detail: { delta: -previousUnread, threadId: id },
              }),
            );
          } catch {}
        }
        emitThreadsUpdated({ source: 'inbox', threadId: id, reason: 'read', immediate: true });
        runWithTransport(
          `thread-read:${id}`,
          () => markThreadRead(id),
          {
            metadata: {
              type: 'markThreadRead',
              threadId: id,
              scope: 'inbox',
            },
          },
        );
      } catch {}

      // Prefetch current, previous, and next thread (sorted list) on idle
      try {
        const list = filteredRequests.length ? filteredRequests : allBookingRequests;
        const idx = list.findIndex((r) => r.id === id);
        if (idx >= 0) {
          const neighbors = [] as { id: number; priority: number; reason: string }[];
          const prevId = list[idx - 1]?.id;
          const nextId = list[idx + 1]?.id;
          if (prevId && prevId !== id) neighbors.push({ id: prevId, priority: 260, reason: 'neighbor' });
          if (nextId && nextId !== id) neighbors.push({ id: nextId, priority: 240, reason: 'neighbor' });
          if (neighbors.length) {
            enqueueThreadPrefetch(neighbors);
            kickThreadPrefetcher();
          }
        }
      } catch {}

      // If this is a Booka synthetic row, resolve the real thread in the background
      if (isBooka) {
        (async () => {
          try {
            const res = await ensureBookaThread();
            const realId = res.data?.booking_request_id || id;
            if (realId && realId !== id && realId !== selectedBookingRequestId) {
              recordThreadSwitchStart(realId, { source: 'system' });
              setSelectedBookingRequestId(realId);
              // Replace URL
              const p = new URLSearchParams(searchParams.toString());
              p.delete('booka');
              p.set('requestId', String(realId));
              router.replace(`?${p.toString()}`, { scroll: false });
              try {
                sessionStorage.setItem(SEL_KEY, String(realId));
                localStorage.setItem(SEL_KEY, JSON.stringify({ id: realId, ts: Date.now() }));
              } catch {}
              await fetchAllRequests();
            }
          } catch {}
        })();
      }
    },
    [
      allBookingRequests,
      filteredRequests,
      searchParams,
      isMobile,
      router,
      fetchAllRequests,
      SEL_KEY,
      enqueueThreadPrefetch,
      kickThreadPrefetcher,
      selectedBookingRequestId,
      recordThreadSwitchStart,
    ]
  );

  useEffect(() => {
    if (!allBookingRequests.length) return;
    const now = Date.now();
    const candidates = [] as PrefetchCandidate[];
    for (let i = 0; i < allBookingRequests.length && candidates.length < PREFETCH_CANDIDATE_LIMIT; i += 1) {
      const req = allBookingRequests[i];
      const id = Number(req?.id);
      if (!id || id === selectedBookingRequestId) continue;
      const unread = Number((req as any).unread_count || 0);
      const tsSource = (req as any).last_message_at || req.updated_at || req.created_at;
      const lastTs = tsSource ? Date.parse(String(tsSource)) : NaN;
      let recencyBoost = 0;
      if (!Number.isNaN(lastTs)) {
        const minutes = Math.max(0, Math.floor((now - lastTs) / 60000));
        recencyBoost = Math.max(0, 60 - Math.min(minutes, 60));
      }
      const priorityBase = unread > 0 ? 420 : 240;
      const priority = priorityBase + recencyBoost - i * 4;
      candidates.push({ id, priority, reason: unread > 0 ? 'unread' : 'list' });
    }
    if (candidates.length) {
      enqueueThreadPrefetch(candidates);
      kickThreadPrefetcher();
    }
  }, [allBookingRequests, selectedBookingRequestId, enqueueThreadPrefetch]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || !filteredRequests.length) return;
    const now = Date.now();
    const candidates = filteredRequests
      .filter((req) => req.id !== selectedBookingRequestId)
      .slice(0, PREFETCH_CANDIDATE_LIMIT)
      .map((req, index) => {
        const unread = Number((req as any).unread_count || 0);
        const tsSource = (req as any).last_message_at || req.updated_at || req.created_at;
        const lastTs = tsSource ? Date.parse(String(tsSource)) : NaN;
        let recencyBoost = 0;
        if (!Number.isNaN(lastTs)) {
          const minutes = Math.max(0, Math.floor((now - lastTs) / 60000));
          recencyBoost = Math.max(0, 50 - Math.min(minutes, 50));
        }
        const priority = (unread > 0 ? 380 : 210) + recencyBoost - index * 5;
        return { id: Number(req.id), priority, reason: 'filter' as const };
      })
      .filter((candidate) => candidate.id !== selectedBookingRequestId && candidate.id > 0);
    if (candidates.length) {
      enqueueThreadPrefetch(candidates);
      kickThreadPrefetcher();
    }
  }, [filteredRequests, query, selectedBookingRequestId, enqueueThreadPrefetch]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ThreadsUpdatedDetail>).detail || {};
      const id = Number(detail.threadId || 0);
      if (!id || id === selectedBookingRequestId) return;
      const reason = detail.reason || 'updated';
      const priority = detail.source === 'realtime' ? 360 : 250;
      markThreadAsStale(id, priority, reason);
      kickThreadPrefetcher();
    };
    window.addEventListener('threads:updated', handler as any);
    return () => {
      window.removeEventListener('threads:updated', handler as any);
    };
  }, [selectedBookingRequestId]);

  const handleBackToList = useCallback(() => {
    setShowList(true);
  }, []);

  if (authLoading || (loadingRequests && allBookingRequests.length === 0)) {
    return (
      <MainLayout hideFooter={true}>
        <div className="flex justify-center items-center min-h-[60vh]">
          <Spinner />
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout hideFooter={true}>
        <div className="p-4 text-red-600">{error}</div>
      </MainLayout>
    );
  }

  const selectedRequest = allBookingRequests.find((r) => r.id === selectedBookingRequestId) || null;

  return (
    <MainLayout fullWidthContent hideFooter={true}>
      {/* Lock inbox to viewport to prevent page scroll; headers stay visible */}
      <div
        className="fixed inset-x-0 bottom-0 flex flex-col bg-white"
        style={{ top: isMobile && !showList ? 0 : 'var(--app-header-height, 64px)', zIndex: isMobile && !showList ? 60 : undefined }}
      >
        {!transport.online && <OfflineBanner />}
        <div className="flex flex-col md:flex-row overflow-hidden flex-1">
        {(!isMobile || showList) && (
          <div
            id="conversation-list-wrapper"
            className="w-full px-4 md:w-1/4 lg:w-1/4 border-gray-100 flex-shrink-0 h-full min-h-0 flex flex-col overflow-hidden border-gray-100"
          >
            <div className="p-3 sticky top-0 z-10 bg-white space-y-2 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold">Messages</h1>
                {unreadTotal > 0 && (
                  <span
                    aria-label={`${unreadTotal} unread messages`}
                    className="inline-flex items-center justify-center rounded-full bg-black text-white min-w-[22px] h-6 px-2 text-xs font-semibold"
                  >
                    {unreadTotal > 99 ? '99+' : unreadTotal}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  aria-label="Search conversations"
                  placeholder="Search by name or message"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="pointer-events-none absolute right-2 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
            </div>
            <div id="conversation-list-body" className="flex-1 min-h-0">
              {filteredRequests.length > 0 ? (
                <ConversationList
                  bookingRequests={filteredRequests}
                  selectedRequestId={selectedBookingRequestId}
                  onSelectRequest={handleSelect}
                  currentUser={user}
                  query={query}
                  height={listHeight > 0 ? listHeight : undefined}
                />
              ) : (
                <p className="p-6 text-center text-gray-500">No conversations found.</p>
              )}
            </div>
          </div>
        )}
        {(!isMobile || !showList) && (
          <div id="chat-thread" className="flex-1 relative min-h-0 overflow-hidden">
            {isMobile && (
              <button
                onClick={handleBackToList}
                aria-label="Back to conversations"
                className="absolute top-2 left-2 z-20 p-2 bg-white rounded-full shadow-md md:hidden"
              >
                <ArrowLeftIcon className="h-5 w-5 text-gray-700" />
              </button>
            )}
            {selectedBookingRequestId ? (
              <>
                <MessageThreadWrapper
                  key={`active-${selectedBookingRequestId}`}
                  bookingRequestId={selectedBookingRequestId}
                  bookingRequest={allBookingRequests.find((r) => r.id === selectedBookingRequestId) || null}
                  setShowReviewModal={setShowReviewModal}
                  isActive={true}
                />
                {hydratedThreadIds.filter((id) => id !== selectedBookingRequestId).length > 0 && (
                  <div style={{ display: 'none' }} aria-hidden="true">
                    {hydratedThreadIds
                      .filter((id) => id !== selectedBookingRequestId)
                      .map((id) => (
                        <MessageThreadWrapper
                          key={`bg-${id}`}
                          bookingRequestId={id}
                          bookingRequest={allBookingRequests.find((r) => r.id === id) || null}
                          setShowReviewModal={setShowReviewModal}
                          isActive={false}
                        />
                      ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 text-center p-4">
                <p>Select a conversation to view messages.</p>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
      {selectedRequest && (
        <ReviewFormModal
          isOpen={showReviewModal}
          bookingId={
            (selectedRequest as { booking_id?: number | null }).booking_id ?? 0
          }
          onClose={() => setShowReviewModal(false)}
          onSubmitted={() => setShowReviewModal(false)}
        />
      )}
    </MainLayout>
  );
}
