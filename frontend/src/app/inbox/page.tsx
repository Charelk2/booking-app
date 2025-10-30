// Your InboxPage.tsx
'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { type ThreadsUpdatedDetail } from '@/lib/chat/threadsEvents';
import { Spinner } from '@/components/ui';
// list + thread panes moved to features/inbox
import ReviewFormModal from '@/components/review/ReviewFormModal';
import { getMessagesForBookingRequest, getMessagesBatch, ensureBookaThread, markThreadMessagesRead } from '@/lib/api';
import { useTransportState } from '@/hooks/useTransportState';
import { useThreads } from '@/features/inbox/hooks/useThreads';
import {
  isOfflineError,
  isTransientTransportError,
  runWithTransport,
} from '@/lib/transportState';
import { BREAKPOINT_MD } from '@/lib/breakpoints';
import { BookingRequest } from '@/types';
// icons are handled inside panes
import ConversationPane from '@/features/inbox/components/ConversationPane';
import ThreadPane from '@/features/inbox/components/ThreadPane';
import useUnreadThreadsCount from '@/hooks/useUnreadThreadsCount';
import { writeThreadCache, readThreadCache, readThreadFromIndexedDb } from '@/lib/chat/threadCache';
import { prefetchQuotesByIds } from '@/hooks/useQuotes';
import {
  initThreadPrefetcher,
  resetThreadPrefetcher,
  enqueueThreadPrefetch,
  setActivePrefetchThread,
  markThreadAsStale,
  kickThreadPrefetcher,
} from '@/lib/chat/threadPrefetcher';
import type { PrefetchCandidate } from '@/lib/chat/threadPrefetcher';
import { recordThreadSwitchStart } from '@/lib/chat/inboxTelemetry';
import { counterpartyLabel } from '@/lib/names';
import OfflineBanner from '@/components/inbox/OfflineBanner';
import { getSummaries as cacheGetSummaries, setSummaries as cacheSetSummaries, subscribe as cacheSubscribe, setLastRead as cacheSetLastRead } from '@/lib/chat/threadCache';

export default function InboxPage() {
  const { user, loading: authLoading } = useAuth();

  const [threads, setThreads] = useState<BookingRequest[]>(() => cacheGetSummaries() as any);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);

  const replaceThreads = useCallback((items: BookingRequest[]) => {
    cacheSetSummaries(items as any);
  }, []);

  const mutateThreads = useCallback((updater: (threads: BookingRequest[]) => BookingRequest[]) => {
    const next = updater(cacheGetSummaries() as any);
    cacheSetSummaries(next as any);
  }, []);

  const applyLocalRead = useCallback((id: number) => {
    if (!id) return;
    const record = (cacheGetSummaries() as any[]).find((t) => t.id === id) as any;
    const unreadBefore = Number(record?.unread_count || 0) || 0;
    if (unreadBefore > 0 && typeof window !== 'undefined') {
      try {
        window.dispatchEvent(
          new CustomEvent('inbox:unread', {
            detail: { delta: -unreadBefore, threadId: id },
          }),
        );
      } catch {}
    }
    const lastMessageId = Number(
      record?.last_message_id ??
        record?.lastMessageId ??
        record?.last_message?.id ??
        0,
    );
    if (Number.isFinite(lastMessageId) && lastMessageId > 0) {
      cacheSetLastRead(id, lastMessageId);
    } else {
      cacheSetLastRead(id, undefined);
    }
    // Also zero unread locally in cached summaries so ConversationList updates immediately
    try {
      const prior = cacheGetSummaries() as any[];
      if (Array.isArray(prior) && prior.length) {
        const next = prior.map((s: any) =>
          Number(s?.id) === Number(id)
            ? { ...s, unread_count: 0, is_unread_by_current_user: false }
            : s,
        );
        cacheSetSummaries(next as any);
        try { window.dispatchEvent(new CustomEvent('threads:updated', { detail: { threadId: id, reason: 'read' } })); } catch {}
      }
    } catch {}

    // Persist read state server-side immediately to keep remote aggregates in sync
    // Do this best-effort and tolerate offline by queuing via runWithTransport
    try {
      runWithTransport(
        `thread-read:${id}`,
        async () => { await markThreadMessagesRead(id); },
        { metadata: { type: 'markThreadMessagesRead', threadId: id, lastMessageId } },
      );
    } catch {}
  }, []);
  const [loadingRequests, setLoadingRequests] = useState(false);
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
  // height is measured inside ConversationPane
  // Track last manual row click to avoid URL-sync overriding immediate selection
  const manualSelectAtRef = useRef<number>(0);
  // Coalesce URL updates and ignore stale scheduled replaces
  const urlReplaceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // While current time is less than this, skip URL-sync effect
  const suppressUrlSyncUntilRef = useRef<number>(0);
  // Mirror of currently selected id for validating scheduled callbacks
  const selectedIdRef = useRef<number | null>(null);
  // Ensure we only attempt to create a Booka thread once per mount
  const ensureTriedRef = useRef(false);
  // Debounce focus/visibility-triggered refreshes
  const lastRefreshAtRef = useRef<number>(0);
  const hydratedRef = useRef<boolean>(false);
  // Header unread badge (live)
  const { count: unreadTotal } = useUnreadThreadsCount();
  const transport = useTransportState();
  const fetchTaskId = useMemo(
    () => `inbox-threads:${user?.id ?? 'anon'}`,
    [user?.id],
  );
  const { refreshThreads } = useThreads(user ?? null);

  // active thread id is owned locally here; cache is a pure data store

  useEffect(() => {
    if (selectedThreadId == null) return;
    selectedIdRef.current = selectedThreadId;
    setHydratedThreadIds((prev) => {
      const next = [selectedThreadId, ...prev.filter((id) => id !== selectedThreadId)];
      return next.slice(0, 2);
    });
  }, [selectedThreadId]);

  useEffect(() => {
    setActivePrefetchThread(selectedThreadId ?? null);
  }, [selectedThreadId]);

  // If not authenticated, send to login early and avoid firing API calls
  // Single auth gate: redirect to login only after authLoading settles.
  // Avoid duplicate or early redirects that can cause a visible bounce.
  // The fetchAllRequests call in the effect below handles the authenticated path.

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

  useEffect(() => {
    const unsubscribe = cacheSubscribe(() => {
      setThreads(cacheGetSummaries() as any);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < BREAKPOINT_MD);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchAllRequests = useCallback(async () => {
    if (authLoading || !user) return;
    try {
      await refreshThreads();
      setLoadingRequests(false);
      return;
    } catch {
      // ignore; fallback code removed for clarity
    }
  }, [authLoading, user, refreshThreads]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace('/login?redirect=/inbox');
      } else {
        fetchAllRequests();
      }
    }
  }, [authLoading, user, router, fetchAllRequests]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleMissing = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: number }>).detail || {};
      const id = Number(detail.id);
      if (!id) return;
      mutateThreads((prev) => {
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
      setSelectedThreadId((current) => (current === id ? null : current));
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
  }, [CACHE_KEY, LATEST_CACHE_KEY, persistKey, SEL_KEY, mutateThreads, setSelectedThreadId]);

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
      const detail = (event as CustomEvent<ThreadsUpdatedDetail>).detail || {};
      const id = Number(detail.threadId || 0);
      if (id && id === selectedThreadId) return;
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
  }, [fetchAllRequests, selectedThreadId]);

  // Select conversation based on URL param after requests load; if none, restore persisted selection
  useEffect(() => {
    if (!threads.length) return;
    const justManuallySelected = Date.now() - (manualSelectAtRef.current || 0) < 5000;
    if (justManuallySelected) return;
    if (Date.now() < suppressUrlSyncUntilRef.current) return;

    const urlId = Number(searchParams.get('requestId'));
    const isBooka = Boolean(searchParams.get('booka') || searchParams.get('bookasystem'));
    if (isBooka) {
      (async () => {
        try {
          const res = await ensureBookaThread();
          const realId = res.data?.booking_request_id;
          if (realId && realId !== selectedThreadId) {
            recordThreadSwitchStart(realId, { source: 'system' });
            setSelectedThreadId(realId);
          }
        } catch {}
      })();
      return;
    }
    if (
      urlId &&
      urlId !== selectedThreadId &&
      threads.find((r) => r.id === urlId)
    ) {
      recordThreadSwitchStart(urlId, { source: 'restored' });
      setSelectedThreadId(urlId);
      applyLocalRead(urlId);
    } else if (selectedThreadId == null) {
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
          selId !== selectedThreadId &&
          threads.find((r) => r.id === selId)
        ) {
          recordThreadSwitchStart(selId, { source: 'restored' });
          setSelectedThreadId(selId);
          applyLocalRead(selId);
          return;
        }
      } catch {}
      // Fallback to most recent
      const fallbackId = threads[0]?.id;
      if (fallbackId && fallbackId !== selectedThreadId) {
        recordThreadSwitchStart(fallbackId, { source: 'restored' });
        setSelectedThreadId(fallbackId);
        applyLocalRead(fallbackId);
      }
    }
  }, [threads, searchParams, selectedThreadId, SEL_KEY, PERSIST_TTL_MS, applyLocalRead]);


  const filteredRequests = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((r) => {
      const name = counterpartyLabel(r as any, user ?? undefined, (r as any)?.counterparty_label || '')
        .toString()
        .toLowerCase();
      const preview = (r.last_message_content || r.service?.title || r.message || '')
        .toString()
        .toLowerCase();
      return name.includes(q) || preview.includes(q);
    });
  }, [threads, query, user]);

  // Prefetch helper with LRU writes
  const PREFETCH_STALE_MS = 5 * 60 * 1000;
  const PREFETCH_DEFAULT_LIMIT = 50; // breadth-first: last 50 per thread
  const PREFETCH_CANDIDATE_LIMIT = 15;

  const inflightByThreadRef = useRef<Map<number, AbortController>>(new Map());

  const prefetchThreadMessages = useCallback(async (id: number, limit = PREFETCH_DEFAULT_LIMIT) => {
    if (!id) return;
    try {
      // Cancel any in-flight fetch for this thread to avoid piling up long requests
      try {
        const prev = inflightByThreadRef.current.get(id);
        if (prev) {
          try { prev.abort(); } catch {}
          inflightByThreadRef.current.delete(id);
        }
      } catch {}
      const ac = new AbortController();
      inflightByThreadRef.current.set(id, ac);

      // Try delta against the last cached id for minimal payloads
      let lastId: number | null = null;
      try {
        const rec = await readThreadFromIndexedDb(id);
        if (rec && Array.isArray(rec.messages) && rec.messages.length) {
          const last = rec.messages[rec.messages.length - 1] as any;
          const lid = Number(last?.id ?? last?.message_id ?? 0);
          if (Number.isFinite(lid) && lid > 0) lastId = lid;
        }
      } catch {}
      if (lastId == null) {
        try {
          const cached = readThreadCache(id);
          if (Array.isArray(cached) && cached.length) {
            const last = cached[cached.length - 1] as any;
            const lid = Number(last?.id ?? last?.message_id ?? 0);
            if (Number.isFinite(lid) && lid > 0) lastId = lid;
          }
        } catch {}
      }

      const mergeAndWrite = (base: any[], incoming: any[]) => {
        const map = new Map<number, any>();
        for (const m of base || []) {
          const idn = Number((m as any)?.id ?? 0);
          if (Number.isFinite(idn) && idn > 0) map.set(idn, m);
        }
        for (const m of incoming || []) {
          const idn = Number((m as any)?.id ?? 0);
          if (!Number.isFinite(idn) || idn <= 0) continue;
          const prev = map.get(idn) || {};
          map.set(idn, { ...prev, ...m });
        }
        const next = Array.from(map.values()).sort((a: any, b: any) => {
          const at = Date.parse(String(a?.timestamp || '')) || 0;
          const bt = Date.parse(String(b?.timestamp || '')) || 0;
          if (at !== bt) return at - bt;
          return (Number(a?.id || 0) - Number(b?.id || 0));
        });
        writeThreadCache(id, next);
        return next;
      };

      if (lastId && lastId > 0) {
        const res = await getMessagesForBookingRequest(id, { mode: 'delta', after_id: lastId, limit: Math.max(20, limit) }, { signal: ac.signal });
        const incoming = Array.isArray((res.data as any)?.items) ? (res.data as any).items : [];
        if (incoming.length) {
          const base = (readThreadCache(id) || []) as any[];
          const merged = mergeAndWrite(base, incoming);
          try {
            const qids = Array.from(new Set<number>(merged.map((m: any) => Number(m?.quote_id)).filter((n) => Number.isFinite(n) && n > 0)));
            if (qids.length) await prefetchQuotesByIds(qids);
          } catch {}
        }
      } else {
        const res = await getMessagesForBookingRequest(id, { limit, mode: 'lite' }, { signal: ac.signal });
        writeThreadCache(id, res.data.items);
        try {
          const items = Array.isArray((res.data as any)?.items) ? (res.data as any).items : [];
          const ids = Array.from(new Set<number>(items.map((m: any) => Number(m?.quote_id)).filter((n: number) => Number.isFinite(n) && n > 0))) as number[];
          if (ids.length) await prefetchQuotesByIds(ids as number[]);
        } catch {}
      }
    } catch {}
  }, [prefetchQuotesByIds]);

  // One-shot breadth-first batch warmup for the top visible threads
  const batchWarmedRef = useRef<boolean>(false);
  const warmedIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!threads.length) return;
    if (batchWarmedRef.current) return;
    // Disabled by default; flip if needed
    batchWarmedRef.current = true;
  }, [threads]);

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
      manualSelectAtRef.current = Date.now();
      let selectedNow: any = null;
      let unreadBefore = 0;
      try {
        selectedNow = threads.find((r) => r.id === id) as any;
        unreadBefore = Number(selectedNow?.unread_count || 0) || 0;
      } catch {}
      recordThreadSwitchStart(id, { source: 'list_click', unreadBefore });
      setSelectedThreadId(id);
      applyLocalRead(id);
      const isBooka = Boolean(selectedNow?.is_booka_synthetic);
      const params = new URLSearchParams(searchParams.toString());
      if (isBooka) {
        params.delete('requestId');
        params.set('booka', '1');
      } else {
        params.delete('booka');
        params.set('requestId', String(id));
      }
      try {
        const nextSearch = `?${params.toString()}`;
        if (typeof window === 'undefined' || window.location.search !== nextSearch) {
          if (urlReplaceTimerRef.current) {
            clearTimeout(urlReplaceTimerRef.current);
            urlReplaceTimerRef.current = null;
          }
          const scheduledId = id;
          urlReplaceTimerRef.current = setTimeout(() => {
            if (selectedIdRef.current !== scheduledId) return;
            suppressUrlSyncUntilRef.current = Date.now() + 4000;
            try { router.replace(nextSearch, { scroll: false }); } catch {}
          }, 0);
        }
      } catch {
        if (urlReplaceTimerRef.current) {
          clearTimeout(urlReplaceTimerRef.current);
          urlReplaceTimerRef.current = null;
        }
        const scheduledId = id;
        urlReplaceTimerRef.current = setTimeout(() => {
          if (selectedIdRef.current !== scheduledId) return;
          suppressUrlSyncUntilRef.current = Date.now() + 4000;
          try { router.replace(`?${params.toString()}`, { scroll: false }); } catch {}
        }, 0);
      }

      // Prime quote cache from any locally cached messages.
      try {
        const cached = readThreadCache(id) as any[] | null;
        if (Array.isArray(cached) && cached.length) {
          const ids = Array.from(new Set<number>(cached.map((m: any) => Number(m?.quote_id)).filter((n: number) => Number.isFinite(n) && n > 0))) as number[];
          if (ids.length) void prefetchQuotesByIds(ids as number[]);
        }
      } catch {}
      try {
        sessionStorage.setItem(SEL_KEY, String(id));
        localStorage.setItem(SEL_KEY, JSON.stringify({ id, ts: Date.now() }));
      } catch {}
      if (isMobile) setShowList(false);

      // Prefetch neighbors on idle (disabled by default)
      try {
        if (INBOX_PREFETCH_ENABLED) {
          const list = filteredRequests.length ? filteredRequests : threads;
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
        }
      } catch {}

      if (isBooka) {
        (async () => {
          try {
            const res = await ensureBookaThread();
            const realId = res.data?.booking_request_id || id;
            if (realId && realId !== id && realId !== selectedThreadId) {
              recordThreadSwitchStart(realId, { source: 'system' });
              setSelectedThreadId(realId);
              applyLocalRead(realId);
              const p = new URLSearchParams(searchParams.toString());
              p.delete('booka');
              p.set('requestId', String(realId));
              try {
                const nextSearch = `?${p.toString()}`;
                if (typeof window === 'undefined' || window.location.search !== nextSearch) {
                  if (urlReplaceTimerRef.current) {
                    clearTimeout(urlReplaceTimerRef.current);
                    urlReplaceTimerRef.current = null;
                  }
                  const scheduledId = realId;
                  urlReplaceTimerRef.current = setTimeout(() => {
                    if (selectedIdRef.current !== scheduledId) return;
                    suppressUrlSyncUntilRef.current = Date.now() + 4000;
                    try { router.replace(nextSearch, { scroll: false }); } catch {}
                  }, 0);
                }
              } catch {
                if (urlReplaceTimerRef.current) {
                  clearTimeout(urlReplaceTimerRef.current);
                  urlReplaceTimerRef.current = null;
                }
                const scheduledId = realId;
                urlReplaceTimerRef.current = setTimeout(() => {
                  if (selectedIdRef.current !== scheduledId) return;
                  suppressUrlSyncUntilRef.current = Date.now() + 4000;
                  try { router.replace(`?${p.toString()}`, { scroll: false }); } catch {}
                }, 0);
              }
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
      threads,
      filteredRequests,
      searchParams,
      isMobile,
      router,
      fetchAllRequests,
      SEL_KEY,
      selectedThreadId,
      applyLocalRead,
    ]
  );

  useEffect(() => {
    if (!threads.length) return;
    const now = Date.now();
    const candidates = [] as PrefetchCandidate[];
    for (let i = 0; i < threads.length && candidates.length < PREFETCH_CANDIDATE_LIMIT; i += 1) {
      const req = threads[i];
      const id = Number(req?.id);
      if (!id || id === selectedThreadId) continue;
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
    if (INBOX_PREFETCH_ENABLED && candidates.length) {
      enqueueThreadPrefetch(candidates);
      kickThreadPrefetcher();
    }
  }, [threads, selectedThreadId]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || !filteredRequests.length) return;
    const now = Date.now();
    const candidates = filteredRequests
      .filter((req) => req.id !== selectedThreadId)
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
      .filter((candidate) => candidate.id !== selectedThreadId && candidate.id > 0);
    if (INBOX_PREFETCH_ENABLED && candidates.length) {
      enqueueThreadPrefetch(candidates);
      kickThreadPrefetcher();
    }
  }, [filteredRequests, query, selectedThreadId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ThreadsUpdatedDetail>).detail || {};
      const id = Number(detail.threadId || 0);
      if (!id || id === selectedThreadId) return;
      const reason = detail.reason || 'updated';
      const priority = detail.source === 'realtime' ? 360 : 250;
      if (INBOX_PREFETCH_ENABLED) {
        markThreadAsStale(id, priority, reason);
        kickThreadPrefetcher();
      }
    };
    window.addEventListener('threads:updated', handler as any);
    return () => {
      window.removeEventListener('threads:updated', handler as any);
    };
  }, [selectedThreadId]);

  const handleBackToList = useCallback(() => {
    setShowList(true);
  }, []);

  if (authLoading || (loadingRequests && threads.length === 0)) {
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

  const selectedRequest = threads.find((r) => r.id === selectedThreadId) || null;

  return (
    <MainLayout fullWidthContent hideFooter={true}>
      {/* Lock inbox to viewport to prevent page scroll; headers stay visible */}
      <div
        className="fixed inset-x-0 bottom-0 flex flex-col bg-gray-50"
        style={{ top: isMobile && !showList ? 0 : 'var(--app-header-height, 64px)', zIndex: isMobile && !showList ? 60 : undefined }}
      >
        {!transport.online && <OfflineBanner />}
        {/* Centered container with rounded card that holds both panes */}
        <div className="flex-1 overflow-hidden">
          <div className="max-w-full sm:max-w-screen-2xl mx-auto w-full px-0 sm:px-4 md:px-6 lg:px-8 py-2 md:py-4 h-full">
            <div className="rounded-none sm:rounded-2xl border border-gray-200 bg-white shadow-sm h-full min-h-0
                            flex flex-col md:grid md:grid-cols-[320px_minmax(0,1fr)]">
              {(!isMobile || showList) && (
                <ConversationPane
                  threads={filteredRequests}
                  selectedThreadId={selectedThreadId}
                  onSelect={handleSelect}
                  currentUser={user}
                  unreadTotal={unreadTotal}
                  query={query}
                  onQueryChange={setQuery}
                />
              )}
              {(!isMobile || !showList) && (
                <ThreadPane
                  selectedThreadId={selectedThreadId}
                  threads={threads}
                  isMobile={isMobile}
                  onBack={handleBackToList}
                  setShowReviewModal={setShowReviewModal}
                />
              )}
            </div>
          </div>
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

// Prefetch controls: keep inbox responsive and avoid thundering herds
const INBOX_PREFETCH_ENABLED = false;
