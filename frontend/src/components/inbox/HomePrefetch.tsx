'use client';

import * as React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';
import { useThreads } from '@/features/inbox/hooks/useThreads';
import { initThreadPrefetcher, enqueueThreadPrefetch, kickThreadPrefetcher } from '@/lib/chat/threadPrefetcher';
import { getMessagesForBookingRequest, getMessagesBatch } from '@/lib/api';
import { writeThreadCache } from '@/lib/chat/threadCache';
import { prefetchQuotesByIds } from '@/hooks/useQuotes';
import { threadStore } from '@/lib/chat/threadStore';

function useIdle(fn: () => void, timeout = 800) {
  React.useEffect(() => {
    let cancelled = false;
    const run = () => { if (!cancelled) fn(); };
    try {
      const id = (window as any).requestIdleCallback?.(run, { timeout })
        ?? window.setTimeout(run, timeout);
      return () => {
        cancelled = true;
        if ((window as any).cancelIdleCallback) (window as any).cancelIdleCallback(id);
        else window.clearTimeout(id as number);
      };
    } catch {
      const id = window.setTimeout(run, timeout);
      return () => { cancelled = true; window.clearTimeout(id); };
    }
  }, [fn, timeout]);
}

export default function HomePrefetch() {
  const { user } = useAuth();
  const { refreshThreads } = useThreads(user ?? null);
  const pathname = usePathname();
  const ON_INBOX = Boolean(pathname && pathname.startsWith('/inbox'));

  // If we are on /inbox and already have a stored session user, kick off a
  // threads refresh immediately (in parallel with auth bootstrap) to avoid
  // cold-start delay on first entry.
  React.useEffect(() => {
    if (!user) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!ON_INBOX) return;
    void (async () => {
      try { await refreshThreads(); } catch {}
    })();
  }, [ON_INBOX, user, refreshThreads]);

  // Helper: short cooldown to avoid redundant heavy warming when navigating
  // between Inbox and Home repeatedly.
  const COOLDOWN_MS = 15_000;
  const lastWarmKey = 'inbox:lastWarmAt';

  // Start prefetch gently after auth + idle
  useIdle(() => {
    if (!user) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    // Respect poor connections / Save-Data
    try {
      const conn: any = (navigator as any).connection;
      if (conn?.saveData) return;
      const eff = String(conn?.effectiveType || '').toLowerCase();
      if (eff === 'slow-2g' || eff === '2g') return;
    } catch {}

    // If threads are already in memory and we recently warmed, do a quick
    // ETag refresh only and skip batch warming to keep Home snappy.
    void (async () => {
      try { await refreshThreads(); } catch {}

      try {
        const hasThreads = Array.isArray(threadStore.getThreads()) && threadStore.getThreads().length > 0;
        const last = Number(sessionStorage.getItem(lastWarmKey) || '0');
        const withinCooldown = Date.now() - last < COOLDOWN_MS;
        if (hasThreads && withinCooldown) {
          return; // skip heavy warming
        }
      } catch {}

      // Initialize prefetcher (idempotent)
      initThreadPrefetcher(async (id: number, limit: number) => {
        try {
          const res = await getMessagesForBookingRequest(id, { limit, mode: 'lite' });
          const items = Array.isArray((res as any)?.data?.items) ? (res as any).data.items : [];
          writeThreadCache(id, items);
          try {
            const qids = Array.from(new Set<number>(items.map((m: any) => Number(m?.quote_id)).filter((n) => Number.isFinite(n) && n > 0)));
            if (qids.length) await prefetchQuotesByIds(qids);
          } catch {}
        } catch {}
      }, { defaultLimit: 50, staleMs: 5 * 60 * 1000 });

      // Identify top threads by recency for a small batch warmup
      const list = threadStore.getThreads();
      if (!Array.isArray(list) || list.length === 0) return;
      const BATCH = 10;
      const ids = list.slice(0, BATCH).map((r: any) => Number(r?.id)).filter((n) => Number.isFinite(n) && n > 0);
      // One-shot batch warmup (best-effort)
      if (ids.length) {
        try {
          const res = await getMessagesBatch(ids, 50, 'lite');
          const map = (res?.data as any)?.threads as Record<string, any[]> | undefined;
          const quotes = (res?.data as any)?.quotes as Record<number, any> | undefined;
          if (map && typeof map === 'object') {
            for (const [key, msgs] of Object.entries(map)) {
              const tid = Number(key);
              if (!Number.isFinite(tid) || tid <= 0) continue;
              writeThreadCache(tid, Array.isArray(msgs) ? msgs : []);
            }
          }
          try {
            if (quotes && typeof quotes === 'object') {
              const qids = Object.keys(quotes).map((k) => Number(k)).filter((n) => Number.isFinite(n) && n > 0);
              if (qids.length) await prefetchQuotesByIds(qids);
            }
          } catch {}
        } catch {}
      }

      // Enqueue broader set for background warming
      try {
        const candidates = list.slice(0, 50).map((r: any, i: number) => ({ id: Number(r.id), priority: 220 - i * 2, reason: 'home' as const }))
          .filter((c) => Number.isFinite(c.id) && c.id > 0);
        if (candidates.length) {
          enqueueThreadPrefetch(candidates as any);
          kickThreadPrefetcher();
        }
        // Record last warm time to throttle subsequent heavy warms.
        try { sessionStorage.setItem(lastWarmKey, String(Date.now())); } catch {}
      } catch {}
    })();
  }, 1000);

  return null;
}
