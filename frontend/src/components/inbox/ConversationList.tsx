'use client';

import React, { CSSProperties } from 'react';
import clsx from 'clsx';
import { FixedSizeList as List, areEqual as areRowPropsEqual } from 'react-window';
import SafeImage from '@/components/ui/SafeImage';
import { BookingRequest, User } from '@/types';
import { getMessagesForBookingRequest } from '@/lib/api';
import { hasThreadCache, writeThreadCache } from '@/lib/threadCache';

// --------------------------------------------------------------------------------------
// Lightweight, fast, no-jank conversation list
// - Virtualized rows
// - Stable itemData & handlers (no per-row re-creation)
// - Scroll position restore
// - Idle prefetch of top/unread threads
// - Minimal work in render path, all heavy lifting precomputed with useMemo
// --------------------------------------------------------------------------------------

type Props = {
  bookingRequests: BookingRequest[];
  selectedRequestId: number | null;
  onSelectRequest: (id: number) => void;
  currentUser?: User | null;
  query?: string;
  height?: number;
};

type PreRow = {
  id: number;
  name: string;
  avatar?: string | null;
  dateISO?: string | null;
  dateLabel: string;
  preview: string;
  previewLower: string;
  nameLower: string;
  unreadCount: number;
  isUnread: boolean;
  chip: 'EVENT' | 'VIDEO' | 'QUOTE' | 'INQUIRY' | null;
  isBookaModeration: boolean;
  version: number; // changes when unread/preview/date change
};

type RowData = {
  rows: PreRow[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  qLower: string;
};

const ROW_H = 74;
const STORAGE_KEY_SCROLL = 'inbox:convList:scrollOffset';
const STORAGE_TOP_ID = 'inbox:convList:topId';

// Intl formatters (module-scope cache)
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const mdFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long' });

function formatThreadTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diffDays = Math.round((+startOf(now) - +startOf(d)) / 86_400_000);
  if (diffDays === 0) return timeFmt.format(d);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `last ${weekdayFmt.format(d)}`;
  return mdFmt.format(d);
}

function highlightParts(original: string, lower: string, qLower: string) {
  const q = qLower.trim();
  if (!q) return { before: original, match: '', after: '', has: false } as const;
  const idx = lower.indexOf(q);
  if (idx === -1) return { before: original, match: '', after: '', has: false } as const;
  return {
    before: original.slice(0, idx),
    match: original.slice(idx, idx + q.length),
    after: original.slice(idx + q.length),
    has: true,
  } as const;
}

function buildPreRows(
  items: BookingRequest[],
  currentUser?: User | null,
): PreRow[] {
  const isArtist = currentUser?.user_type === 'service_provider';

  return items.map((req) => {
    const otherName = (() => {
      if (isArtist) return req.client?.first_name || 'Client';
      return (
        req.artist_profile?.business_name ||
        req.artist?.business_name ||
        req.artist?.user?.first_name ||
        req.artist?.first_name ||
        'Service Provider'
      );
    })();
    const avatar = isArtist
      ? req.client?.profile_picture_url
      : (req.artist_profile?.profile_picture_url || req.artist?.profile_picture_url) ?? null;

    const dateISO = (req.last_message_timestamp || req.updated_at || req.created_at) as string | undefined;
    const dateLabel = formatThreadTime(dateISO || null);

    // Chip logic (kept lean)
    const text = String(req.last_message_content || '').toLowerCase();
    const isPersonalizedVideo = String(req.service?.service_type || '').toLowerCase() === 'personalized video';
    const acceptedQuote = !!(req as any).accepted_quote_id;
    const status = String(req.status || '').toLowerCase();
    const paidOrConfirmed =
      acceptedQuote ||
      /payment\s*received|booking\s*confirmed/.test(text) ||
      ['confirmed', 'completed', 'request_confirmed', 'request_completed'].includes(status);

    const chip: PreRow['chip'] =
      isPersonalizedVideo ? 'VIDEO'
      : paidOrConfirmed ? 'EVENT'
      : /(sent a quote|quote sent|provided a quote|new quote)/i.test(String(req.last_message_content || '')) ? 'QUOTE'
      : null;

    // INQUIRY chip only if nothing else is present and local hint set
    let inquiry = false;
    try {
      if (!chip && typeof window !== 'undefined' && localStorage.getItem(`inquiry-thread-${req.id}`)) inquiry = true;
    } catch {}

    const isSyntheticBooka = Boolean((req as any).is_booka_synthetic);
    const preview = (() => {
      if (
        req.last_message_content === 'Artist sent a quote' ||
        req.last_message_content === 'Service Provider sent a quote'
      ) {
        return isArtist ? 'You sent a quote' : `${otherName} sent a quote`;
      }
      return (req.last_message_content ?? req.service?.title ?? (req as any).message ?? 'New Request') as string;
    })();

    const isUnreadFlag =
      (req as any).is_unread_by_current_user === true ||
      (req as any).is_unread_by_current_user === 1 ||
      (req as any).is_unread_by_current_user === '1' ||
      (req as any).is_unread_by_current_user === 'true';

    const unreadCountRaw = Number((req as any).unread_count || 0);
    const unreadCount = unreadCountRaw > 0 ? unreadCountRaw : (isUnreadFlag ? 1 : 0);

    const name = String(otherName || '');
    const nameLower = name.toLowerCase();
    const previewLower = String(preview || '').toLowerCase();

    // "version" is how the row signals it must re-render.
    // If last_message changes or unread counters change, version changes.
    const version =
      (dateISO ? new Date(dateISO).getTime() : 0) ^
      (unreadCount << 4) ^
      (isUnreadFlag ? 1 : 0) ^
      (previewLower.length << 1);

    return {
      id: req.id,
      name,
      avatar,
      dateISO: dateISO || null,
      dateLabel,
      preview,
      previewLower,
      nameLower,
      unreadCount,
      isUnread: unreadCount > 0,
      chip: inquiry ? 'INQUIRY' : chip,
      isBookaModeration: isSyntheticBooka,
      version,
    };
  });
}

function RowMemo({
  index,
  style,
  data,
}: {
  index: number;
  style: CSSProperties;
  data: RowData;
}) {
  const pre = data.rows[index];
  const isActive = data.selectedId === pre.id;

  const partsName = data.qLower
    ? highlightParts(pre.name, pre.nameLower, data.qLower)
    : { before: pre.name, match: '', after: '', has: false };

  const partsPrev = data.qLower
    ? highlightParts(pre.preview, pre.previewLower, data.qLower)
    : { before: pre.preview, match: '', after: '', has: false };

  const initials = pre.name ? pre.name.charAt(0) : 'U';

  return (
    <button
      type="button"
      data-id={pre.id}
      onClick={() => data.onSelect(pre.id)}
      style={style}
      className={clsx(
        'flex items-center gap-3 px-4 py-3 w-full text-left transition-colors rounded-lg',
        isActive ? 'bg-gray-100 ring-1 ring-gray-200' : 'hover:bg-gray-50',
      )}
    >
      {pre.avatar ? (
        <SafeImage
          src={pre.avatar}
          alt={`${pre.name} avatar`}
          width={40}
          height={40}
          sizes="40px"
          loading="lazy"
          className="rounded-full object-cover flex-shrink-0 border border-gray-200"
        />
      ) : (
        <div className="h-10 w-10 rounded-full bg-black text-white flex-shrink-0 grid place-items-center text-lg font-medium">
          {initials}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className={clsx('flex items-center justify-between', pre.isUnread ? 'font-semibold text-gray-900' : 'text-gray-700')}>
          <span className="truncate min-w-0">
            {partsName.has ? (
              <>
                {partsName.before}
                <span className="bg-yellow-100 text-yellow-800 rounded px-0.5">{partsName.match}</span>
                {partsName.after}
              </>
            ) : (
              pre.name
            )}
          </span>
          <time className={clsx('text-xs ml-2 flex-shrink-0', pre.isUnread ? 'font-semibold text-gray-900' : 'text-gray-500')}>
            {pre.dateLabel}
          </time>
        </div>

        <div className={clsx('mt-0.5 text-xs flex items-start justify-between gap-3', pre.isUnread ? 'font-semibold text-gray-800' : 'text-gray-600')}>
          <div className="inline-flex items-center gap-2 min-w-0 truncate">
            {pre.chip === 'EVENT' && (
              <span className="px-1.5 py-0.5 text-[10px] rounded border bg-emerald-50 text-emerald-700 border-emerald-200 flex-shrink-0">EVENT</span>
            )}
            {pre.chip === 'VIDEO' && (
              <span className="px-1.5 py-0.5 text-[10px] rounded border bg-emerald-50 text-emerald-700 border-emerald-200 flex-shrink-0">VIDEO</span>
            )}
            {pre.chip === 'QUOTE' && (
              <span className="px-1.5 py-0.5 text-[10px] rounded border bg-amber-50 text-amber-700 border-amber-200 flex-shrink-0">QUOTE</span>
            )}
            {pre.chip === 'INQUIRY' && (
              <span className="px-1.5 py-0.5 text-[10px] rounded border bg-indigo-50 text-indigo-700 border-indigo-200 flex-shrink-0">INQUIRY</span>
            )}
            <span className="truncate">
              {partsPrev.has ? (
                <>
                  {partsPrev.before}
                  <span className="bg-yellow-100 text-yellow-800 rounded px-0.5">{partsPrev.match}</span>
                  {partsPrev.after}
                </>
              ) : (
                pre.preview
              )}
            </span>
          </div>

          {pre.unreadCount > 0 && (
            <span
              aria-label={`${pre.unreadCount} unread messages`}
              className="ml-2 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-black text-white min-w-[20px] h-5 px-1 text-[11px] font-semibold"
            >
              {pre.unreadCount > 99 ? '99+' : pre.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// Avoid re-renders unless: index/style change OR row.version/selection changed
const Row = React.memo(RowMemo, (prev, next) => {
  if (!areRowPropsEqual(prev as any, next as any)) return false; // compares index/style/data reference
  const { rows, selectedId } = prev.data as RowData;
  const prevRow = rows[prev.index];
  const nextRow = (next.data as RowData).rows[next.index];
  if (!prevRow || !nextRow) return false;
  if (prevRow.id !== nextRow.id) return false;
  if (prevRow.version !== nextRow.version) return false;
  if (selectedId !== (next.data as RowData).selectedId) {
    const isThis = prevRow.id === selectedId || prevRow.id === (next.data as RowData).selectedId;
    if (isThis) return false;
  }
  return true;
});

export default function ConversationList({
  bookingRequests,
  selectedRequestId,
  onSelectRequest,
  currentUser,
  query = '',
  height,
}: Props) {
  const qLower = query.trim().toLowerCase();

  const rows = React.useMemo(
    () => buildPreRows(bookingRequests, currentUser),
    [bookingRequests, currentUser],
  );

  // Save/restore scroll
  const listRef = React.useRef<any>(null);
  const listHeight = React.useMemo(() => {
    if (typeof height === 'number' && height > 0) return height;
    if (typeof window !== 'undefined') return Math.min(Math.floor(window.innerHeight * 0.7), 640);
    return 560;
  }, [height]);

  React.useEffect(() => {
    try {
      const off = Number(sessionStorage.getItem(STORAGE_KEY_SCROLL) || '0');
      if (listRef.current && Number.isFinite(off) && off > 0) listRef.current.scrollTo(off);
    } catch {}
  }, []);

  const handleScroll = React.useCallback((ev: { scrollOffset: number }) => {
    try {
      sessionStorage.setItem(STORAGE_KEY_SCROLL, String(ev.scrollOffset));
      const idx = Math.max(0, Math.round(ev.scrollOffset / ROW_H));
      const id = rows[idx]?.id;
      if (id) sessionStorage.setItem(STORAGE_TOP_ID, String(id));
    } catch {}
  }, [rows]);

  // Idle prefetch of top (favor unread) for instant open
  const prefetching = React.useRef<Set<number>>(new Set());
  const prefetchThread = React.useCallback(async (id: number) => {
    if (!id || prefetching.current.has(id) || hasThreadCache(id)) return;
    prefetching.current.add(id);
    try {
      const res = await getMessagesForBookingRequest(id, { limit: 50 });
      const arr = Array.isArray(res.data) ? res.data : [];
      writeThreadCache(id, arr);
    } catch {
      // best-effort
    } finally {
      prefetching.current.delete(id);
    }
  }, []);

  React.useEffect(() => {
    if (!rows.length) return;
    const top = rows.slice(0, Math.min(6, rows.length));
    const prioritized = [...top].sort((a, b) => b.unreadCount - a.unreadCount);
    const ids = prioritized.slice(0, 3).map((r) => r.id);

    const schedule = (fn: () => void) => {
      const ric = (window as any)?.requestIdleCallback as undefined | ((cb: IdleRequestCallback, opts?: any) => void);
      if (ric) ric(() => fn(), { timeout: 700 });
      else setTimeout(fn, 60);
    };
    schedule(() => ids.forEach((id) => void prefetchThread(id)));
  }, [rows, prefetchThread]);

  const itemData = React.useMemo<RowData>(() => ({
    rows,
    selectedId: selectedRequestId,
    onSelect: onSelectRequest,
    qLower,
  }), [rows, selectedRequestId, onSelectRequest, qLower]);

  // Outer element prevents anchor default inside rows (defensive)
  const Outer = React.useMemo(
    () =>
      React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function OuterDiv(props, ref) {
        const { onClick, ...rest } = props;
        return (
          <div
            {...rest}
            ref={ref}
            role="listbox"
            aria-label="Conversations"
            onClick={(e) => {
              const t = e.target as HTMLElement;
              if (t?.closest?.('a')) {
                e.preventDefault();
                e.stopPropagation();
              }
              onClick?.(e as any);
            }}
          />
        );
      }),
    [],
  );

  if (!rows.length) {
    // Skeleton for empty/initial load
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="h-10 w-10 rounded-full bg-gray-200 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-3/5 bg-gray-200 rounded animate-pulse" />
              <div className="h-3 w-4/5 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <List
      ref={listRef}
      height={listHeight}
      itemCount={rows.length}
      itemSize={ROW_H}
      width="100%"
      overscanCount={6}
      outerElementType={Outer}
      itemData={itemData}
      itemKey={(index) => rows[index]?.id ?? index}
      onScroll={handleScroll}
      onItemsRendered={({ visibleStartIndex }) => {
        try {
          const id = rows[visibleStartIndex]?.id;
          if (id) sessionStorage.setItem(STORAGE_TOP_ID, String(id));
        } catch {}
      }}
      className="divide-y divide-gray-100"
    >
      {Row}
    </List>
  );
}
