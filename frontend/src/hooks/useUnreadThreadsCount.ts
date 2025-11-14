import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { getInboxUnread } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { subscribe as cacheSubscribe, getSummaries as cacheGetSummaries } from '@/lib/chat/threadCache';

// Lightweight client-side cache to reduce server load from frequent updates
let _unreadLastEtag: string | null = null;
let _unreadLastFetchAt = 0;
let _unreadInflight: Promise<number> | null = null;

function fetchAggregateUnread(prev?: number): Promise<number> {
  const now = Date.now();
  // Throttle network calls to at most once every 5 seconds
  if (now - _unreadLastFetchAt < 5000 && typeof prev === 'number') {
    return Promise.resolve(prev);
  }
  if (_unreadInflight) return _unreadInflight;
  _unreadLastFetchAt = now;
  _unreadInflight = getInboxUnread({
    // Treat 200 or 304 as success; keep previous on 304
    validateStatus: (s) => s === 200 || s === 304,
    headers: _unreadLastEtag ? { 'If-None-Match': _unreadLastEtag } : undefined,
  })
    .then((r) => {
      try { _unreadLastEtag = String((r.headers as any)?.etag || '') || _unreadLastEtag; } catch {}
      if (r.status === 304) return typeof prev === 'number' ? prev : 0;
      return Number((r.data?.total ?? r.data?.count ?? 0));
    })
    .catch(() => (typeof prev === 'number' ? prev : 0))
    .finally(() => { _unreadInflight = null; });
  return _unreadInflight;
}

export default function useUnreadThreadsCount() {
  const [count, setCount] = useState<number>(0);
  const { user } = useAuth();
  const debouncedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countRef = useRef<number>(0);
  useEffect(() => { countRef.current = count; }, [count]);

  const recomputeFromCache = useCallback(() => {
    try {
      const list = cacheGetSummaries() as any[];
      const local = Array.isArray(list)
        ? list.reduce((a, s: any) => a + (Number(s?.unread_count || 0) || 0), 0)
        : 0;
      const next = Math.max(0, Number(local || 0));
      if (next !== countRef.current) setCount(next);
    } catch {}
  }, []);

  const compute = useCallback(async (prevCount?: number) => {
    // First reflect local cache
    recomputeFromCache();
    // Then consult server; only allow raising
    try {
      const server = await fetchAggregateUnread(countRef.current);
      if (server !== countRef.current) setCount(server);
    } catch {}
    return countRef.current;
  }, [recomputeFromCache]);

  useEffect(() => {
    let canceled = false;
    const setFromCompute = async () => {
      if (!user) { if (!canceled) setCount(0); return; }
      const next = await compute(count);
      if (!canceled) setCount(next);
    };

    const scheduleCompute = (delayMs = 800) => {
      if (debouncedTimerRef.current) return;
      debouncedTimerRef.current = setTimeout(() => {
        debouncedTimerRef.current = null;
        void setFromCompute();
      }, delayMs);
    };

    // seed now
    void setFromCompute();

    // Refresh on cache changes, but throttle and only when visible to reduce jitter
    const onCacheChange = () => {
      try {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      } catch {}
      if (cacheTimerRef.current) return;
      cacheTimerRef.current = setTimeout(() => {
        cacheTimerRef.current = null;
        scheduleCompute(200); // slight delay to coalesce bursts
      }, 200);
    };
    const unsub = cacheSubscribe(onCacheChange);

    // refresh on badge delta and when tab becomes visible
    const onBadgeDelta = (ev: Event) => {
      try {
        const d = (ev as CustomEvent<{ delta?: number; total?: number }>).detail || {};
        // Treat totals as a poke only; recompute from cache which is the source of truth
        if (typeof (d as any).total === 'number') {
          recomputeFromCache();
          return;
        }
        if (typeof d.delta === 'number' && Number.isFinite(d.delta)) {
          const delta = Number(d.delta);
          setCount((c) => Math.max(0, c + delta));
          // Heal any drift shortly after local delta
          scheduleCompute(200);
        }
      } catch {}
      // For other events, reconcile soon
      scheduleCompute(0);
    };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void setFromCompute();
      }
    };
    const onFocus = () => { void setFromCompute(); };
    if (typeof window !== 'undefined') {
      try { window.addEventListener('inbox:unread', onBadgeDelta as EventListener); } catch {}
      try { window.addEventListener('focus', onFocus); } catch {}
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      canceled = true;
      try { unsub(); } catch {}
      if (typeof window !== 'undefined') {
        try { window.removeEventListener('inbox:unread', onBadgeDelta as EventListener); } catch {}
        try { window.removeEventListener('focus', onFocus); } catch {}
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      if (debouncedTimerRef.current) { try { clearTimeout(debouncedTimerRef.current); } catch {} debouncedTimerRef.current = null; }
      if (cacheTimerRef.current) { try { clearTimeout(cacheTimerRef.current); } catch {} cacheTimerRef.current = null; }
    };
  }, [compute, user]);

  return useMemo(() => ({ count }), [count]);
}
