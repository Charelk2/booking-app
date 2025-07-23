'use client';
import { useState, useEffect } from 'react';
export default function useMediaQuery(q: string) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const cb = (e: MediaQueryListEvent) => setM(e.matches);
    setM(mq.matches);
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
  }, [q]);
  return m;
}
