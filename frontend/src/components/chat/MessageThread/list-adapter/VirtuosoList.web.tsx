// components/chat/MessageThread/list-adapter/VirtuosoList.web.tsx
// Web virtualization adapter that wraps react-virtuoso and exposes ChatListHandle.
import * as React from 'react';
import { useRef, useImperativeHandle, forwardRef, useEffect, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import type { ChatListHandle } from './ChatListHandle';
import { findVirtuosoScroller } from '../utils/dom';

type Range = { startIndex: number; endIndex: number };

type VirtuosoListProps = {
  data: any[];
  itemContent: (index: number) => React.ReactNode;
  computeItemKey?: (index: number) => React.Key;
  followOutput?: (isAtBottom: boolean) => false | 'smooth';
  startReached?: () => void;
  atBottomStateChange?: (atBottom: boolean) => void;
  rangeChanged?: (range: Range) => void;
  initialTopMostItemIndex?: number;
  increaseViewportBy?: { top: number; bottom: number };
  overscan?: number;
  alignToBottom?: boolean;
  style?: React.CSSProperties;
  className?: string;
  renderHeader?: () => React.ReactNode;
};

function VirtuosoListImpl(
  {
    data,
    itemContent,
    computeItemKey,
    followOutput,
    startReached,
    atBottomStateChange,
    rangeChanged,
    initialTopMostItemIndex,
    increaseViewportBy,
    overscan,
    alignToBottom,
    style,
    className,
    renderHeader,
  }: VirtuosoListProps,
  ref: React.Ref<ChatListHandle>,
) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const atBottomCallbacks = useRef<Set<(b: boolean) => void>>(new Set());
  const dataLenRef = useRef<number>(data?.length ?? 0);
  useEffect(() => { dataLenRef.current = data?.length ?? 0; }, [data?.length]);

  // Fallback: if virtualization container can't get a height (0px), render a plain list.
  const [usePlainList, setUsePlainList] = useState<boolean>(false);
  useEffect(() => {
    let raf1: number | null = null;
    let raf2: number | null = null;
    const check = () => {
      const h = containerRef.current?.clientHeight || 0;
      // If we have data but zero height, prefer plain list to at least render content
      if (h === 0 && (Array.isArray(data) && data.length > 0)) setUsePlainList(true);
    };
    raf1 = requestAnimationFrame(() => {
      check();
      raf2 = requestAnimationFrame(check);
    });
    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef.current, Array.isArray(data) ? data.length : 0]);

  // Provide a safe, stable key function for react-virtuoso.
  // If a custom computeItemKey was provided, delegate to it; otherwise, derive from group contents.
  const keyFn = React.useCallback((index: number, item?: any) => {
    try {
      if (typeof computeItemKey === 'function') return computeItemKey(index);
      const msgs = item?.messages;
      const firstId = Array.isArray(msgs) && msgs.length > 0 ? msgs[0]?.id : undefined;
      const lastId = Array.isArray(msgs) && msgs.length > 0 ? msgs[msgs.length - 1]?.id : undefined;
      if (Number.isFinite(firstId) && Number.isFinite(lastId)) return `g-${firstId}-${lastId}`;
      const gid = item?.id ?? item?.groupId ?? null;
      if (gid != null) return `g-${gid}`;
      return `idx-${index}`;
    } catch {
      return `idx-${index}`;
    }
  }, [computeItemKey]);

  useImperativeHandle(ref, () => ({
    scrollToEnd: (opts?: { smooth?: boolean }) => {
      try {
        const last = Math.max(0, (dataLenRef.current || 0) - 1);
        virtuosoRef.current?.scrollToIndex?.({ index: last, align: 'end', behavior: opts?.smooth ? 'smooth' : 'auto' });
      } catch {}
    },
    scrollToIndex: (index: number, opts?: { align?: 'start'|'center'|'end'; smooth?: boolean }) => {
      try {
        virtuosoRef.current?.scrollToIndex?.({ index, align: opts?.align || 'start', behavior: opts?.smooth ? 'smooth' : 'auto' });
      } catch {}
    },
    scrollBy: (deltaPx: number) => {
      try { (virtuosoRef.current as any)?.scrollBy?.({ top: deltaPx, behavior: 'auto' }); } catch {}
    },
    adjustForPrependedItems: (count: number, insertedHeightPx?: number) => {
      try { (virtuosoRef.current as any)?.adjustForPrependedItems?.(count, insertedHeightPx); } catch {}
    },
    getScroller: () => findVirtuosoScroller(containerRef.current!),
    onAtBottomChange: (cb: (b: boolean) => void) => { atBottomCallbacks.current.add(cb); },
    refreshMeasurements: (() => {
      let queued = false;
      return () => {
        if (queued) return;
        queued = true;
        try {
          requestAnimationFrame(() => {
            try { (virtuosoRef.current as any)?.refresh?.(); } catch {}
            queued = false;
          });
        } catch {
          // Fallback without rAF
          try { (virtuosoRef.current as any)?.refresh?.(); } catch {}
          queued = false;
        }
      };
    })(),
  }));

  // When in plain list mode, scroll to bottom on data grow if alignToBottom is requested.
  useEffect(() => {
    if (!usePlainList) return;
    if (!alignToBottom) return;
    try {
      const sc = containerRef.current;
      if (!sc) return;
      sc.scrollTop = sc.scrollHeight;
    } catch {}
  }, [usePlainList, alignToBottom, Array.isArray(data) ? data.length : 0]);

  if (usePlainList) {
    // Simple non-virtualized list to guarantee rendering when measurement fails
    return (
      <div ref={containerRef} className={className} style={{ ...(style || {}), overflowY: 'auto' }}>
        {renderHeader ? <div>{renderHeader()}</div> : null}
        {(Array.isArray(data) ? data : []).map((_, idx) => (
          <div key={String(keyFn(idx, (data as any[])[idx]))}>{itemContent(idx)}</div>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={className}>
      <Virtuoso
        ref={virtuosoRef}
        data={Array.isArray(data) ? data : []}
        alignToBottom={alignToBottom}
        // Always provide a function; some react-virtuoso code paths assume it exists.
        computeItemKey={keyFn as any}
        itemContent={(index: number) => itemContent(index)}
        components={renderHeader ? { Header: () => <>{renderHeader()}</> } : undefined}
        rangeChanged={rangeChanged as any}
        followOutput={followOutput as any}
        // react-virtuoso accesses `.index` on this value in some paths;
        // ensure it is always defined to avoid runtime errors.
        initialTopMostItemIndex={initialTopMostItemIndex ?? 0}
        style={style}
        startReached={startReached}
        atBottomStateChange={(b: boolean) => {
          try { atBottomStateChange?.(b); } catch {}
          try { atBottomCallbacks.current.forEach((cb) => cb(b)); } catch {}
        }}
        increaseViewportBy={increaseViewportBy ?? { top: 400, bottom: 600 }}
        overscan={typeof overscan === 'number' ? overscan : 200}
      />
    </div>
  );
}

export default forwardRef<ChatListHandle, VirtuosoListProps>(VirtuosoListImpl);
