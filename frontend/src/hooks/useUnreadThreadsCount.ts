'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getMessageThreadsPreview, getMessageThreads, getInboxUnread } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export default function useUnreadThreadsCount(pollMs = 30000) {
  const [count, setCount] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { user, loading } = useAuth();
  const etagRef = useRef<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (loading) return;
    if (!user) {
      setCount(0);
      return;
    }
    try {
      // Prefer tiny unread endpoint with ETag; fall back to previews if missing
      try {
        const res = await getInboxUnread(etagRef.current);
        if (res.status === 200 && typeof res.data?.total === 'number') {
          const et = (res.headers as any)?.etag as string | undefined;
          if (et) etagRef.current = et;
          setCount(res.data.total);
          return;
        }
        if (res.status === 304) {
          return; // unchanged
        }
      } catch {}

      const role = user?.user_type === 'service_provider' ? 'artist' : 'client';
      const preview = await getMessageThreadsPreview(role as any);
      const items = preview.data?.items || [];
      let total = items.reduce((acc, it) => acc + (Number(it.unread_count || 0) || 0), 0);
      if (total === 0) {
        try {
          const t = await getMessageThreads();
          const arr = (t.data || []) as any[];
          total = arr.reduce((acc, th) => acc + (Number((th as any).unread_count || 0) || 0), 0);
        } catch {}
      }
      setCount(total);
    } catch (err) {
      // best-effort; avoid console noise in header
    }
  }, [loading, user]);

  useEffect(() => {
    if (!user || loading) {
      setCount(0);
      if (timerRef.current) clearInterval(timerRef.current);
      return; // Do not start timers when logged out
    }
    void refresh();
    const handleBump = () => void refresh();
    if (typeof window !== 'undefined') {
      window.addEventListener('threads:updated', handleBump);
    }
    if (pollMs > 0) {
      timerRef.current = setInterval(() => void refresh(), pollMs);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (typeof window !== 'undefined') {
          window.removeEventListener('threads:updated', handleBump);
        }
      };
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('threads:updated', handleBump);
      }
    };
  }, [refresh, pollMs, user, loading]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ total?: number; delta?: number }>).detail || {};
      if (typeof detail.total === 'number') {
        setCount(Math.max(0, detail.total));
        return;
      }
      if (typeof detail.delta === 'number' && detail.delta !== 0) {
        setCount((prev) => Math.max(0, prev + detail.delta));
      }
    };
    window.addEventListener('inbox:unread', handler as EventListener);
    return () => window.removeEventListener('inbox:unread', handler as EventListener);
  }, []);

  return { count, refresh };
}
