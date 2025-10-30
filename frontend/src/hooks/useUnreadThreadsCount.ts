import { useMemo, useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { getApiOrigin } from '@/lib/api';
import { subscribe as cacheSubscribe, getSummaries as cacheGetSummaries } from '@/lib/chat/threadCache';

function fetchAggregateUnread(): Promise<number> {
  return axios
    .get<{ total?: number; count?: number }>(`${getApiOrigin()}/api/v1/inbox/unread`, { withCredentials: true })
    .then((r) => Number((r.data?.total ?? r.data?.count ?? 0)))
    .catch(() => 0);
}

export default function useUnreadThreadsCount() {
  const [count, setCount] = useState<number>(0);

  const compute = useCallback(async () => {
    const list = cacheGetSummaries() as any[];
    const local = Array.isArray(list)
      ? list.reduce((a, s: any) => a + (Number(s?.unread_count || 0) || 0), 0)
      : 0;
    let server = 0;
    try {
      server = await fetchAggregateUnread();
    } catch {}
    return Math.max(local, server);
  }, []);

  useEffect(() => {
    let canceled = false;
    const setFromCompute = async () => {
      const next = await compute();
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
