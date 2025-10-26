// components/chat/MessageThread/list-adapter/PlainList.web.tsx
// Lightweight non-virtualized chat list with top sentinel + smooth follow.
import * as React from 'react';
import type { ChatListHandle } from './ChatListHandle';
import { isAtBottom as isAtBottomUtil } from '../utils/scroll';

type Range = { startIndex: number; endIndex: number };

type PlainListProps = {
  data: any[];
  itemContent: (index: number) => React.ReactNode;
  computeItemKey?: (index: number) => React.Key;
  followOutput?: (isAtBottom: boolean) => false | 'smooth';
  startReached?: () => void;
  atBottomStateChange?: (atBottom: boolean) => void;
  rangeChanged?: (range: Range) => void; // kept for compatibility (no-op)
  alignToBottom?: boolean;
  style?: React.CSSProperties;
  className?: string;
  renderHeader?: () => React.ReactNode;
};

function PlainListImpl(
  {
    data,
    itemContent,
    computeItemKey,
    followOutput,
    startReached,
    atBottomStateChange,
    rangeChanged,
    alignToBottom,
    style,
    className,
    renderHeader,
  }: PlainListProps,
  ref: React.Ref<ChatListHandle>,
) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const atBottomCallbacks = React.useRef<Set<(b: boolean) => void>>(new Set());
  const prevLengthRef = React.useRef<number>(Array.isArray(data) ? data.length : 0);
  const lastScrolledAtRef = React.useRef<number>(0);
  const didInitScrollRef = React.useRef<boolean>(false);

  // Expose handle
  React.useImperativeHandle(ref, () => ({
    scrollToEnd: (opts?: { smooth?: boolean }) => {
      try {
        const sc = containerRef.current;
        if (!sc) return;
        const top = (sc.scrollHeight || 0) - (sc.clientHeight || 0);
        sc.scrollTo({ top, behavior: opts?.smooth ? 'smooth' : 'auto' });
      } catch {}
    },
    scrollToIndex: (_index: number, _opts?: { align?: 'start'|'center'|'end'; smooth?: boolean }) => {
      // Not implemented; unused by current orchestrator
    },
    scrollBy: (deltaPx: number) => {
      try {
        const sc = containerRef.current;
        if (!sc) return;
        sc.scrollTop = (sc.scrollTop || 0) + deltaPx;
      } catch {}
    },
    adjustForPrependedItems: (_count: number, _insertedHeightPx?: number) => {
      // No-op: anchor preservation is handled by the caller via pre/after hooks
    },
    getScroller: () => containerRef.current,
    onAtBottomChange: (cb: (b: boolean) => void) => { atBottomCallbacks.current.add(cb); },
    refreshMeasurements: () => {},
  }));

  // On mount or when data changes, optionally align to bottom
  React.useEffect(() => {
    if (!alignToBottom) return;
    try {
      const sc = containerRef.current;
      if (!sc) return;
      // On first paint with data (even if data was prefilled from cache), scroll to bottom automatically
      if (!didInitScrollRef.current && (Array.isArray(data) && data.length > 0)) {
        const top = (sc.scrollHeight || 0) - (sc.clientHeight || 0);
        sc.scrollTop = top;
        didInitScrollRef.current = true;
        // Ensure append follower treats the next effect as non-initial
        prevLengthRef.current = Array.isArray(data) ? data.length : 0;
      }
    } catch {}
  }, [alignToBottom, Array.isArray(data) ? data.length : 0]);

  // Follow to bottom when new items append and followOutput says to do so
  React.useEffect(() => {
    try {
      const sc = containerRef.current;
      if (!sc) return;
      const prevLen = prevLengthRef.current || 0;
      const nextLen = Array.isArray(data) ? data.length : 0;
      prevLengthRef.current = nextLen;
      if (nextLen <= prevLen) return;
      // Ignore the very first append after mount; initial-scroll already aligned to bottom
      if (prevLen === 0) return;
      const atBottom = isAtBottomUtil(sc);
      const follow = typeof followOutput === 'function' ? followOutput(atBottom) : false;
      if (follow) {
        const top = (sc.scrollHeight || 0) - (sc.clientHeight || 0);
        sc.scrollTo({ top, behavior: follow === 'smooth' ? 'smooth' : 'auto' });
      }
    } catch {}
  }, [data, followOutput]);

  // Scroll listeners: detect top/bottom and trigger callbacks
  const lastAtBottomRef = React.useRef<boolean | null>(null);
  const onScroll = React.useCallback(() => {
    const sc = containerRef.current;
    if (!sc) return;
    lastScrolledAtRef.current = Date.now();
    const top = sc.scrollTop || 0;
    const maxTop = Math.max(0, (sc.scrollHeight || 0) - (sc.clientHeight || 0));
    const atBottom = isAtBottomUtil(sc);
    if (lastAtBottomRef.current !== atBottom) {
      lastAtBottomRef.current = atBottom;
      try { atBottomStateChange?.(atBottom); } catch {}
      try { atBottomCallbacks.current.forEach((cb) => cb(atBottom)); } catch {}
    }
    // Top reached sentinel
    if (top <= 8) {
      try { startReached?.(); } catch {}
    }
    // Range reporting (coarse): not used, but keep signature compatibility
    try { rangeChanged?.({ startIndex: 0, endIndex: Array.isArray(data) ? data.length - 1 : 0 }); } catch {}
  }, [data, atBottomStateChange, rangeChanged, startReached]);

  return (
    <div ref={containerRef} className={className} style={{ ...(style || {}), overflowY: 'auto' }} onScroll={onScroll}>
      {renderHeader ? <div>{renderHeader()}</div> : null}
      {(Array.isArray(data) ? data : []).map((_, idx) => (
        <div key={String(computeItemKey ? computeItemKey(idx) : idx)}>{itemContent(idx)}</div>
      ))}
    </div>
  );
}

export default React.forwardRef<ChatListHandle, PlainListProps>(PlainListImpl);
