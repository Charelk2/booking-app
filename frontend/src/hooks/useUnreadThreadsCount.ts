'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getMessageThreadsPreview, getMessageThreads } from '@/lib/api';

export default function useUnreadThreadsCount(pollMs = 30000) {
  const [count, setCount] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const refresh = useCallback(async () => {
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
  }, [refresh, pollMs]);

  return { count, refresh };
}
