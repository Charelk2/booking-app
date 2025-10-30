import { useMemo, useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { getApiOrigin } from '@/lib/api';
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
  _unreadInflight = axios
    .get<{ total?: number; count?: number }>(`${getApiOrigin()}/api/v1/inbox/unread`, {
      withCredentials: true,
      // Treat 200 or 304 as success; keep previous on 304
      validateStatus: (s) => s === 200 || s === 304,
      headers: {
        'Cache-Control': 'no-cache',
        ...(_unreadLastEtag ? { 'If-None-Match': _unreadLastEtag } : {}),
      },
      params: { _: Date.now() },
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

  const compute = useCallback(async (prevCount?: number) => {
    const list = cacheGetSummaries() as any[];
    const local = Array.isArray(list)
      ? list.reduce((a, s: any) => a + (Number(s?.unread_count || 0) || 0), 0)
      : 0;
    let server = 0;
    try {
      server = await fetchAggregateUnread(prevCount);
    } catch {}
    return Math.max(local, server);
  }, []);

  useEffect(() => {
    let canceled = false;
    const setFromCompute = async () => {
      const next = await compute(count);
      if (!canceled) setCount(next);
    };

    // seed now
    void setFromCompute();

    // refresh on cache changes
    const onCacheChange = () => void setFromCompute();
    const unsub = cacheSubscribe(onCacheChange);

    // refresh on badge delta and when tab becomes visible
    const onBadgeDelta = () => void setFromCompute();
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void setFromCompute();
      }
    };
    if (typeof window !== 'undefined') {
      try { window.addEventListener('inbox:unread', onBadgeDelta as EventListener); } catch {}
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      canceled = true;
      try { unsub(); } catch {}
      if (typeof window !== 'undefined') {
        try { window.removeEventListener('inbox:unread', onBadgeDelta as EventListener); } catch {}
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [compute]);

  return useMemo(() => ({ count }), [count]);
}
