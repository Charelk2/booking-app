import { useEffect, useRef, useState, useCallback } from 'react';
import { getInboxUnread } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { subscribe as cacheSubscribe, getSummaries as cacheGetSummaries } from '@/lib/chat/threadCache';

type InboxUnreadDetail = {
  delta?: number;
  total?: number;
  threadId?: number;
};

// Lightweight client-side cache for /inbox/unread
let _unreadInflight: Promise<number> | null = null;
let _unreadLastFetchAt = 0;
let _unreadLastEtag: string | null = null;

async function fetchAggregateUnread(prev: number): Promise<number> {
  const now = Date.now();
  if (_unreadInflight) return _unreadInflight;
  // Throttle to at most once every 5 seconds unless prev is clearly wrong
  if (now - _unreadLastFetchAt < 5000 && Number.isFinite(prev)) {
    return prev;
  }
  _unreadLastFetchAt = now;
  _unreadInflight = (async () => {
    try {
      const resp = await getInboxUnread({
        validateStatus: (s) => s === 200 || s === 304,
        headers: _unreadLastEtag ? { 'If-None-Match': _unreadLastEtag } : undefined,
      });
      try { _unreadLastEtag = String((resp.headers as any)?.etag || '') || _unreadLastEtag; } catch {}
      if (resp.status === 304) return prev;
      const total = Number(resp.data?.total ?? resp.data?.count ?? prev ?? 0) || 0;
      return Math.max(0, total);
    } catch {
      return prev;
    } finally {
      _unreadInflight = null;
    }
  })();
  return _unreadInflight;
}

function sumFromCache(): number {
  try {
    const list = cacheGetSummaries() as any[];
    if (!Array.isArray(list)) return 0;
    const activeId =
      typeof window !== 'undefined'
        ? Number((window as any).__inboxActiveThreadId || 0)
        : 0;
    return list.reduce((acc, s: any) => {
      const tid = Number((s as any)?.id ?? (s as any)?.booking_request_id ?? 0);
      if (activeId && tid === activeId) return acc;
      const n = Number(s?.unread_count ?? 0) || 0;
      return acc + (n > 0 ? n : 0);
    }, 0);
  } catch {
    return 0;
  }
}

export default function useUnreadThreadsCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  countRef.current = count;

  const recomputeFromCache = useCallback(() => {
    const local = sumFromCache();
    const next = Math.max(0, local);
    // Avoid dropping to 0 purely from a stale cache snapshot when we already
    // know about unread messages from the server. Server totals remain the
    // source of truth; cache is allowed to raise the count, but a zero from
    // cache should not temporarily hide unread messages.
    if (next === 0 && countRef.current > 0) {
      return;
    }
    if (next !== countRef.current) {
      setCount(next);
    }
  }, []);

  const syncFromServer = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!user) {
        if (countRef.current !== 0) setCount(0);
        return;
      }
      // Always treat the last known count as the baseline when talking to the
      // server so 304/ETag paths can reuse it. `/inbox/unread` is the primary
      // source of truth; the cache is used to refine it but should never
      // under-report compared to the server snapshot.
      const base = countRef.current || 0;
      const serverTotal = await fetchAggregateUnread(base);
      const local = sumFromCache();
      let next = serverTotal;
      try {
        const summaries = cacheGetSummaries();
        const hasLocal = Array.isArray(summaries) && summaries.length > 0;
        if (hasLocal) {
          // When we have local thread summaries and a server snapshot, do not
          // allow the cache to hide unread messages the server still sees.
          // Use the max so local per-thread increments (e.g., from WS) can lift
          // the total, but stale caches cannot drag it down.
          next = Math.max(0, local, serverTotal);
        } else {
          next = Math.max(0, serverTotal);
        }
      } catch {
        // If cache introspection fails, fall back to the best known total.
        next = Math.max(0, serverTotal || local || 0);
      }
      if (next !== countRef.current) {
        setCount(next);
      }
    },
    [user],
  );

  // Initial bootstrap: local cache, then server snapshot
  useEffect(() => {
    recomputeFromCache();
    void syncFromServer({ force: true });
  }, [recomputeFromCache, syncFromServer]);

  // Keep badge in sync with thread cache (per-thread unread_count)
  useEffect(() => {
    return cacheSubscribe(() => {
      recomputeFromCache();
    });
  }, [recomputeFromCache]);

  // Safety net: refetch on focus / visibility
  useEffect(() => {
    const onFocus = () => { void syncFromServer({ force: true }); };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void syncFromServer({ force: true });
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [syncFromServer]);

  // Realtime aggregate updates from notifications (unread_total over WS).
  useEffect(() => {
    // Treat unread_total packets as a hint that the inbox state changed.
    // We still go through syncFromServer so the same cache+HTTP merge logic
    // is applied instead of blindly trusting a single snapshot.
    const handler = () => {
      void syncFromServer();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('inbox:unread_total', handler as EventListener);
      return () => {
        try { window.removeEventListener('inbox:unread_total', handler as EventListener); } catch {}
      };
    }
    return () => {};
  }, [syncFromServer]);

  return { count };
}
