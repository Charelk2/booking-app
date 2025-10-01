// frontend/src/hooks/useThreadScrollAnchor.ts
import { useCallback } from 'react';

/**
 * Small scroll utilities for chat threads. Centralizes bottom‑anchoring logic
 * so virtual and non‑virtual paths behave consistently.
 */
export default function useThreadScrollAnchor(minOffset = 24) {
  const computeDistanceFromBottom = useCallback((el: HTMLElement | null): number => {
    if (!el) return 0;
    try {
      return el.scrollHeight - (el.scrollTop + el.clientHeight);
    } catch {
      return 0;
    }
  }, []);

  const isAnchored = useCallback((el: HTMLElement | null, distance?: number): boolean => {
    const d = typeof distance === 'number' ? distance : computeDistanceFromBottom(el);
    return d <= minOffset;
  }, [computeDistanceFromBottom, minOffset]);

  const pinToBottom = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    try { el.scrollTop = el.scrollHeight; } catch {}
  }, []);

  const adjustForComposerDelta = useCallback((el: HTMLElement | null, deltaH: number) => {
    if (!el) return;
    if (!deltaH) return;
    if (isAnchored(el)) {
      try { el.scrollTop = Math.max(0, el.scrollTop + deltaH); } catch {}
    }
  }, [isAnchored]);

  return {
    computeDistanceFromBottom,
    isAnchored,
    pinToBottom,
    adjustForComposerDelta,
  };
}

