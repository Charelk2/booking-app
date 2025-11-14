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
      const base = opts?.force ? 0 : countRef.current || 0;
      await fetchAggregateUnread(base);
      const local = sumFromCache();
      if (local !== countRef.current) {
        setCount(local);
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

  // Global unread events: total snapshots + local deltas
  useEffect(() => {
    const onBadgeDelta = (ev: Event) => {
      const detail = (ev as CustomEvent<InboxUnreadDetail>).detail || {};

      // 1) Authoritative snapshot from backend (notifications WS or inbox SSE)
      if (typeof detail.total === 'number' && Number.isFinite(detail.total)) {
        // Prefer recomputing from our local thread cache (which already
        // incorporates optimistic reads and active-thread guards) instead
        // of trusting the aggregate total blindly.
        const next = sumFromCache();
        if (next !== countRef.current) {
          setCount(next);
        }
        return;
      }

      // 2) Local delta (e.g., we just opened a thread and marked it read)
      if (typeof detail.delta === 'number' && Number.isFinite(detail.delta)) {
        const delta = Number(detail.delta);
        if (!delta) return;
        setCount((prev) => Math.max(0, prev + delta));
        // Best-effort heal from server shortly after local change
        void syncFromServer();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('inbox:unread', onBadgeDelta as EventListener);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('inbox:unread', onBadgeDelta as EventListener);
      }
    };
  }, [syncFromServer]);

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

  return { count };
}
