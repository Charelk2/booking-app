import { useCallback, useEffect, useRef, useState } from 'react';

export default function useOfflineQueue<T>(
  storageKey: string,
  process: (item: T) => Promise<void>,
) {
  const [queue, setQueue] = useState<T[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch {
      return [];
    }
  });

  const backoffRef = useRef(1000);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(queue));
    }
  }, [queue, storageKey]);

  const flush = useCallback(async () => {
    if (!navigator.onLine || queue.length === 0) return;
    for (const item of [...queue]) {
      try {
        await process(item);
        setQueue((prev) => prev.filter((q) => q !== item));
        backoffRef.current = 1000;
      } catch {
        timeoutRef.current = setTimeout(flush, backoffRef.current);
        backoffRef.current = Math.min(backoffRef.current * 2, 30000);
        break;
      }
    }
  }, [queue, process]);

  useEffect(() => {
    flush();
    const handleOnline = () => flush();
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [flush]);

  const enqueue = useCallback((item: T) => {
    setQueue((prev) => [...prev, item]);
    if (navigator.onLine) {
      flush();
    }
  }, [flush]);

  return { queue, enqueue, flush };
}
