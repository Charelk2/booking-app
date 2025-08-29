'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getMessageThreadsPreview, getMessageThreads } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export default function useUnreadThreadsCount(pollMs = 30000) {
  const [count, setCount] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { user, loading } = useAuth();

  const refresh = useCallback(async () => {
    if (loading || !user) return; // Skip when unauthenticated or not ready
    try {
      const res = await getMessageThreadsPreview();
      const items = res.data?.items || [];
      let total = items.reduce((acc, it) => acc + (Number(it.unread_count || 0) || 0), 0);
      // Fallback: if preview has no items (e.g., artist with no requests yet),
      // pull thread notifications and sum unread counts so Booka shows a badge.
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
  }, []);

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

  return { count, refresh };
}
