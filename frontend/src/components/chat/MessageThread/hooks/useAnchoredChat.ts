// components/chat/MessageThread/hooks/useAnchoredChat.ts
// Scroll/anchor invariants (web+native friendly API).
import * as React from 'react';
import type { ChatListHandle } from '../list-adapter/ChatListHandle';

export function useAnchoredChat(listRef: React.MutableRefObject<ChatListHandle | null>) {
  const atBottomRef = React.useRef(true);
  const setAtBottom = React.useCallback((v: boolean) => { atBottomRef.current = v; }, []);

  // Internal suppression during prepend to avoid follow jitter
  const suppressAutoFollowRef = React.useRef(false);
  const antiFollowUntilRef = React.useRef<number>(0);
  const startedAtBottomRef = React.useRef(false);
  const preserveAnchorOnceRef = React.useRef(false);

  // Before/after prepend hooks for pixel-delta anchor preserve (works with plain list)
  const prevTopRef = React.useRef(0);
  const prevHeightRef = React.useRef(0);

  const onBeforePrepend = React.useCallback(() => {
    try {
      const scroller = listRef.current?.getScroller();
      if (!scroller) return;
      startedAtBottomRef.current = atBottomRef.current === true;
      // Block follow while we prepend and during any immediate reflows
      suppressAutoFollowRef.current = true;
      antiFollowUntilRef.current = Date.now() + 1200;
      prevTopRef.current = scroller.scrollTop || 0;
      prevHeightRef.current = scroller.scrollHeight || 0;
    } catch {}
  }, [listRef]);

  const onAfterPrepend = React.useCallback(() => {
    try {
      const scroller = listRef.current?.getScroller();
      if (!scroller) return;
      if (startedAtBottomRef.current && !preserveAnchorOnceRef.current) {
        // Keep bottom if the user was anchored
        try { listRef.current?.scrollToEnd({ smooth: true }); } catch {}
      } else {
        // Keep exact visual anchor by adjusting scrollTop by the delta height added.
        const applyDelta = () => {
          try {
            const prevTop = prevTopRef.current || 0;
            const prevH = prevHeightRef.current || 0;
            const curH = scroller.scrollHeight || 0;
            const delta = Math.max(0, curH - prevH);
            scroller.scrollTop = prevTop + delta;
          } catch {}
        };
        // Reapply for 2 frames to beat image/font late reflows
        requestAnimationFrame(() => { applyDelta(); requestAnimationFrame(applyDelta); });
      }
    } catch {}
    // Re-enable auto-follow after this layout cycle settles, but keep the anti-follow window active
    requestAnimationFrame(() => { suppressAutoFollowRef.current = false; });
    preserveAnchorOnceRef.current = false;
  }, [listRef]);

  // followOutput factory — only follow when anchored and not suppressed
  const followOutput = React.useCallback((isAtBottom: boolean) => {
    // During anti-follow window, explicit suppression, or while preserving anchor, never follow
    if (suppressAutoFollowRef.current) return false;
    if (Date.now() < antiFollowUntilRef.current) return false;
    if (preserveAnchorOnceRef.current) return false;
    // Prefer our own anchored state over raw callback value
    return atBottomRef.current ? 'smooth' : false;
  }, []);

  const suppressFollowFor = React.useCallback((ms: number) => {
    const until = Date.now() + Math.max(0, ms || 0);
    antiFollowUntilRef.current = Math.max(antiFollowUntilRef.current, until);
    suppressAutoFollowRef.current = true;
    // Lift explicit suppression soon, keep time-window guard for the rest
    setTimeout(() => { suppressAutoFollowRef.current = false; }, Math.min(600, ms || 0));
  }, []);

  const preserveAnchorOnce = React.useCallback(() => {
    preserveAnchorOnceRef.current = true;
  }, []);

  const scheduleScrollToEndSmooth = React.useCallback(() => {
    try { listRef.current?.scrollToEnd({ smooth: true }); } catch {}
  }, [listRef]);

  const applyComposerDelta = React.useCallback((delta: number) => {
    if (!delta) return;
    if (!atBottomRef.current) return;
    try { listRef.current?.scrollBy(delta); } catch {}
  }, [listRef]);

  return {
    atBottomRef,
    setAtBottom,
    followOutput,
    onBeforePrepend,
    onAfterPrepend,
    scheduleScrollToEndSmooth,
    applyComposerDelta,
    suppressFollowFor,
    preserveAnchorOnce,
  };
}
