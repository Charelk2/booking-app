'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getMessageThreadsPreview } from '@/lib/api';

export default function useUnreadThreadsCount(pollMs = 30000) {
  const [count, setCount] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await getMessageThreadsPreview();
      const items = res.data?.items || [];
      const total = items.reduce((acc, it) => acc + (Number(it.unread_count || 0) || 0), 0);
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
