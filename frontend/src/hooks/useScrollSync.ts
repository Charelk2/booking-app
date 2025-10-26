import { useEffect, useRef } from 'react';
import type React from 'react';

// Syncs scroll position between multiple scroll containers by percentage (0..1).
// Guards against feedback loops with a per-tick lock and uses rAF for smoothness.
export function useScrollSync(refs: Array<React.RefObject<HTMLElement | null>>) {
  const locksRef = useRef<Set<HTMLElement>>(new Set());
  const rafRef = useRef<number | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    const mql = typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)') : null;
    const isDesktop = mql ? mql.matches : true;
    if (!isDesktop) return;

    const els = refs
      .map((r) => r.current)
      .filter((el): el is HTMLElement => !!el);
    if (els.length < 2) return;

    const progress = (el: HTMLElement) => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      if (max <= 0) return 0;
      const top = Math.max(0, Math.min(el.scrollTop, max));
      return top / max;
    };

    const setProgress = (el: HTMLElement, p: number) => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = p * max;
    };

    const onScroll = (src: HTMLElement) => () => {
      if (locksRef.current.has(src)) return;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const p = progress(src);
        locksRef.current.add(src);
        try {
          for (const el of els) {
            if (el === src) continue;
            setProgress(el, p);
          }
        } finally {
          // unlock on next frame to avoid re-entrancy
          requestAnimationFrame(() => locksRef.current.delete(src));
        }
      });
    };

    const scrollHandlers: Array<[HTMLElement, (e: Event) => void]> = [];
    for (const el of els) {
      const h = onScroll(el);
      el.addEventListener('scroll', h, { passive: true });
      scrollHandlers.push([el, h]);
    }

    // Keep in sync when content size changes
    try {
      const ro = new ResizeObserver(() => {
        const leader = els[0]!;
        const p = progress(leader);
        locksRef.current.add(leader);
        for (const el of els) setProgress(el, p);
        requestAnimationFrame(() => locksRef.current.delete(leader));
      });
      roRef.current = ro;
      els.forEach((el) => ro.observe(el));
    } catch {
      // ResizeObserver may not exist in some test environments; ignore.
    }

    // Resync when images inside any panel load (layout shift)
    const imgListeners: Array<() => void> = [];
    for (const el of els) {
      const imgs = Array.from(el.querySelectorAll('img')) as HTMLImageElement[];
      imgs.forEach((img) => {
        if (img.complete) return;
        const onLoad = () => {
          const p = progress(el);
          locksRef.current.add(el);
          for (const other of els) setProgress(other, p);
          requestAnimationFrame(() => locksRef.current.delete(el));
        };
        img.addEventListener('load', onLoad, { once: true });
        imgListeners.push(() => img.removeEventListener('load', onLoad));
      });
    }

    // Initialize: align all to the first element's current progress
    try {
      const leader = els[0]!;
      const p = progress(leader);
      locksRef.current.add(leader);
      for (const el of els) setProgress(el, p);
      requestAnimationFrame(() => locksRef.current.delete(leader));
    } catch {}

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      for (const [el, h] of scrollHandlers) el.removeEventListener('scroll', h);
      try { roRef.current?.disconnect(); } catch {}
      imgListeners.forEach((off) => off());
      locksRef.current.clear();
    };
  }, [refs]);
}

export default useScrollSync;
