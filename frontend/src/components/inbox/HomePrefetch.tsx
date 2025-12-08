'use client';

import * as React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';
import { useThreads } from '@/features/inbox/hooks/useThreads';
import { initThreadPrefetcher, enqueueThreadPrefetch, kickThreadPrefetcher } from '@/lib/chat/threadPrefetcher';
import { getMessagesForBookingRequest, getMessagesBatch } from '@/lib/api';
import { writeThreadCache, getSummaries as cacheGetSummaries } from '@/lib/chat/threadCache';
import { prefetchQuotesByIds, seedGlobalQuotes } from '@/hooks/useQuotes';

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

      // Heavy prefetch disabled to avoid hammering the backend during refresh.
      try {
        const list = cacheGetSummaries() as any[];
        const hasThreads = Array.isArray(list) && list.length > 0;
        const last = Number(sessionStorage.getItem(lastWarmKey) || '0');
        const withinCooldown = Date.now() - last < COOLDOWN_MS;
        if (hasThreads && withinCooldown) {
          return;
        }
      } catch {}
    })();
  }, 1000);

  return null;
}
