'use client';

import clsx from 'clsx';
import SafeImage from '@/components/ui/SafeImage';
import { BookingRequest, User } from '@/types';
import { FixedSizeList as List } from 'react-window';
import type { CSSProperties } from 'react';
import React from 'react';
import { t } from '@/lib/i18n';

// Module-scope helpers so memoized Row can use them
function formatThreadTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const startOf = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    const todayStart = startOf(now);
    const dayStart = startOf(d);
    const diffMs = todayStart.getTime() - dayStart.getTime();
    const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
    if (diffDays === 0) {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) {
      const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
      return `last ${weekday}`;
    }
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

function highlightParts(original: string, lower: string, qLower: string) {
  const q = (qLower || '').trim();
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

interface ConversationListProps {
  bookingRequests: BookingRequest[];
  selectedRequestId: number | null;
  onSelectRequest: (id: number) => void;
  currentUser?: User | null;
  query?: string;
  height?: number; // Optional override; defaults to auto height (all rows)
}

export default function ConversationList({
  bookingRequests,
  selectedRequestId,
  onSelectRequest,
  currentUser,
  query = '',
  height,
}: ConversationListProps) {
  const ROW_HEIGHT = 74;
  const STORAGE_KEY = 'inbox:convListOffset';
  const STORAGE_TOP_ID = 'inbox:convListTopId';
  const STORAGE_TOP_INDEX = 'inbox:convListTopIndex';

  // Persist scroll position so selecting a convo doesn't jump to top.
  // Using any here avoids react-window's namespace/type interop issues for the ref
  const listRef = React.useRef<any>(null);
  const restoredRef = React.useRef(false);
  const lastVisibleStartRef = React.useRef(0);
  const initialOffset = React.useMemo(() => {
    if (typeof window === 'undefined') return 0;
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  }, []);

  const q = query.trim().toLowerCase();
  // Restore on mount if needed (for cases where List remounts due to props)
  React.useEffect(() => {
    if (restoredRef.current) return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const n = raw ? Number(raw) : 0;
      if (listRef.current && Number.isFinite(n) && n > 0) {
        listRef.current.scrollTo(n);
      }
      restoredRef.current = true;
    } catch {}
  }, [bookingRequests.length]);

  // After selecting a conversation, restore the previous scroll offset to avoid jumping to top.
  const restoreAppliedRef = React.useRef(false);
  React.useLayoutEffect(() => {
    if (restoreAppliedRef.current) return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const n = raw ? Number(raw) : 0;
      if (listRef.current) {
        const topId = sessionStorage.getItem(STORAGE_TOP_ID);
        if (topId) {
          const index = bookingRequests.findIndex((r) => String(r.id) === topId);
          if (index >= 0) {
            try { (listRef.current as any).scrollToItem?.(index, 'start'); restoreAppliedRef.current = true; return; } catch {}
          }
        }
        if (Number.isFinite(n) && n >= 0) {
          const idx = Math.max(0, Math.round(n / ROW_HEIGHT));
          try { (listRef.current as any).scrollToItem?.(idx, 'start'); } catch { listRef.current.scrollTo(n); }
        }
        restoreAppliedRef.current = true;
      }
    } catch {}
  }, [bookingRequests.length]);

  // Always provide a bounded height so virtualization stays enabled on first paint.
  const DEFAULT_HEIGHT = typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.7, 640) : 560;
  const listHeight = Number.isFinite(height as any) && (height ?? 0) > 0 ? (height as number) : DEFAULT_HEIGHT;

  // Outer wrapper that suppresses anchor navigation inside the list.
  // IMPORTANT: Pass a stable component reference to react-window to avoid remounting the scroller.
  const Outer = React.useMemo(
    () =>
      React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function OuterDiv(props, ref) {
        const { onClick, ...rest } = props;
        return (
          <div
            {...rest}
            ref={ref}
            role={rest.role ?? 'listbox'}
            aria-label={rest['aria-label'] ?? 'Conversations'}
            onClick={(e) => {
              const t = e.target as HTMLElement;
              if (t && (t as any).closest && (t as any).closest('a')) {
                e.preventDefault();
                e.stopPropagation();
              }
              onClick && onClick(e as any);
            }}
          />
        );
      }),
    [],
  );

  return (
    <List
      ref={listRef}
      height={listHeight}
      itemCount={bookingRequests.length}
      itemSize={ROW_HEIGHT}
      width="100%"
      className="divide-y divide-gray-100"
      overscanCount={4}
      initialScrollOffset={initialOffset}
      itemKey={(index: number) => bookingRequests[index]?.id ?? index}
      onScroll={(ev: { scrollOffset: number }) => {
        try { sessionStorage.setItem(STORAGE_KEY, String(ev.scrollOffset)); } catch {}
      }}
      onItemsRendered={({ visibleStartIndex }: { visibleStartIndex: number }) => {
        lastVisibleStartRef.current = visibleStartIndex;
        try {
          const id = bookingRequests[visibleStartIndex]?.id;
          if (id) {
            sessionStorage.setItem(STORAGE_TOP_ID, String(id));
            sessionStorage.setItem(STORAGE_TOP_INDEX, String(visibleStartIndex));
          }
        } catch {}
      }}
      outerElementType={Outer}
      itemData={useRowData(bookingRequests, selectedRequestId, onSelectRequest, React.useMemo(() => buildPrecomputed(bookingRequests, currentUser, q), [bookingRequests, currentUser, q]), q)}
      children={Row}
    />
  );
}

// ------------------------- Memo Row + itemData ------------------------------
type RowData = {
  items: BookingRequest[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  pre: Record<number, PreRow>;
  q: string;
  onRowClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onRowKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  onRowPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onRowMouseDownCapture: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onRowMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
};

type PreRow = {
  id: number;
  name: string;
  nameLower: string;
  avatar: string | null | undefined;
  date: string;
  preview: string;
  previewLower: string;
  isUnread: boolean;
  unreadCount: number;
  showEvent: boolean;
  showVideo: boolean;
  isQuote: boolean;
  showInquiry: boolean;
  isBookaModeration: boolean;
  showApprovedChip: boolean;
  showRejectedChip: boolean;
  isSupplierInvite: boolean;
  supplierProgram?: string | null;
};

function buildPrecomputed(
  items: BookingRequest[],
  currentUser?: User | null,
  qLower?: string,
): Record<number, PreRow> {
  const isArtist = currentUser?.user_type === 'service_provider';
  const out: Record<number, PreRow> = {};
  const q = (qLower || '').trim();
  for (const req of items) {
    const rawOtherName = (() => {
      if (isArtist) return req.client?.first_name || 'Client';
      const artistProfile = req.artist_profile;
      const artist = req.artist;
      if (!artistProfile && !artist) return 'Service Provider';
      return (
        artistProfile?.business_name ||
        artist?.business_name ||
        artist?.user?.first_name ||
        artist?.first_name ||
        'Service Provider'
      );
    })();
    const name = String(rawOtherName || '');
    const nameLower = name.toLowerCase();
    const avatar = isArtist
      ? req.client?.profile_picture_url
      : req.artist_profile?.profile_picture_url || req.artist?.profile_picture_url;
    const date = (req.last_message_timestamp || req.updated_at || req.created_at) as string;
    const isUnread = (() => {
      const v = (req as any).is_unread_by_current_user;
      return v === true || v === 1 || v === '1' || v === 'true';
    })();
    const isPersonalizedVideo = String(req.service?.service_type || '').toLowerCase() === 'personalized video';
    const paidOrConfirmed = (() => {
      const text = (req.last_message_content || '').toString();
      const status = (req.status || '').toString().toLowerCase();
      const hasAcceptedQuote = (req.accepted_quote_id as unknown as number) ? true : false;
      const paidMsg = /payment\s*received|booking\s*confirmed/i.test(text);
      const confirmed = ['confirmed', 'completed', 'request_confirmed', 'request_completed'].includes(status);
      let localFlag = false;
      try { if (typeof window !== 'undefined') localFlag = !!localStorage.getItem(`booking-confirmed-${req.id}`); } catch {}
      return paidMsg || confirmed || hasAcceptedQuote || localFlag;
    })();
    const showVideo = (() => {
      if (isPersonalizedVideo) return true;
      try { if (typeof window !== 'undefined' && localStorage.getItem(`vo-order-for-thread-${req.id}`)) return true; } catch {}
      return false;
    })();
    const showEvent = !showVideo && paidOrConfirmed;
    const isQuote = (() => {
      const threadState = String(((req as any).thread_state ?? '') || '').toLowerCase();
      if (threadState === 'quoted') return true;
      const hasAcceptedQuote = (req.accepted_quote_id as unknown as number) ? true : false;
      const hasQuotesArr = Array.isArray((req as any).quotes) && (req as any).quotes.length > 0;
      if (hasAcceptedQuote || hasQuotesArr) return true;
      const text = (req.last_message_content || '').toString();
      return /(sent a quote|quote sent|provided a quote|new quote)/i.test(text);
    })();
    const preview = (() => {
      const otherName = name;
      if (
        req.last_message_content === 'Artist sent a quote' ||
        req.last_message_content === 'Service Provider sent a quote'
      ) {
        return isArtist ? 'You sent a quote' : `${otherName} sent a quote`;
      }
      return (req.last_message_content ?? req.service?.title ?? (req as any).message ?? 'New Request') as string;
    })();
    const previewLower = String(preview || '').toLowerCase();
    const previewNormalized = previewLower.replace(/\s+/g, ' ').trim();
    const isSyntheticBooka = Boolean((req as any).is_booka_synthetic);
    const showApprovedChip = /^\s*listing\s+approved:/i.test(previewLower);
    const showRejectedChip = /^\s*listing\s+rejected:/i.test(previewLower);
    const isBookaUpdate = /booka\s*update\b/i.test(previewNormalized);
    const isBookaModeration = isSyntheticBooka || showApprovedChip || showRejectedChip || isBookaUpdate;
    const isSupplierInvite = /preferred sound supplier/i.test(previewLower);
    const supplierProgram = (() => {
      if (!isSupplierInvite) return null;
      const match = preview.match(/preferred sound supplier for\s+(.+?)(?:\.|$)/i);
      return match ? match[1].trim() : null;
    })();
    const showInquiry = (() => {
      if (showEvent || showVideo || isQuote || isBookaModeration || isSupplierInvite) return false;
      const threadState = String(((req as any).thread_state ?? '') || '').toLowerCase();
      const status = (req.status || '').toString().toLowerCase();
      const hasBookingDetails = Boolean((req as any).proposed_datetime_1 || (req as any).proposed_datetime_2 || (req as any).travel_breakdown);
      const hasQuotes = Boolean((req as any).accepted_quote_id) || (Array.isArray((req as any).quotes) && (req as any).quotes.length > 0) || threadState === 'quoted';
      if ((req as any).has_inquiry_card === true) return true;
      try { if (typeof window !== 'undefined' && localStorage.getItem(`inquiry-thread-${req.id}`)) return true; } catch {}
      if (hasBookingDetails || hasQuotes || status.includes('pending_quote')) return false;
      if (threadState === 'inquiry' || threadState === 'requested') return true;
      if (previewLower.includes('new booking request')) return true;
      return false;
    })();
    const rawUnread = Number((req as any).unread_count || 0);
    const unreadCount = rawUnread > 0 ? rawUnread : (isUnread ? 1 : 0);

    out[req.id] = {
      id: req.id,
      name,
      nameLower,
      avatar,
      date,
      preview,
      previewLower,
      isUnread,
      unreadCount,
      showEvent,
      showVideo,
      isQuote,
      showInquiry,
      isBookaModeration,
      showApprovedChip,
      showRejectedChip,
      isSupplierInvite,
      supplierProgram,
    };
  }
  return out;
}

const Row = React.memo(function Row({ index, style, data }: { index: number; style: CSSProperties; data: RowData }) {
  const { items, selectedId, pre, q, onRowClick, onRowKeyDown, onRowPointerDown, onRowMouseDownCapture, onRowMouseEnter } = data;
  const req = items[index];
  const isActive = selectedId === req.id;
  const p = pre[req.id];
  const rowName = p.isBookaModeration ? 'Booka' : p.name;
  const rowAvatar = p.isBookaModeration ? undefined : p.avatar;
  const partsName = q ? highlightParts(p.name, p.nameLower, q) : { before: rowName, match: '', after: '', has: false } as const;
  const partsPrev = q ? highlightParts(String(p.preview), p.previewLower, q) : { before: String(p.preview), match: '', after: '', has: false } as const;

  return (
    <button
      type="button"
      style={style}
      key={req.id}
      role="option"
      aria-selected={isActive}
      tabIndex={0}
      data-id={req.id}
      onClick={onRowClick}
      onKeyDown={onRowKeyDown}
      onMouseEnter={onRowMouseEnter}
      onPointerDown={onRowPointerDown}
      onMouseDownCapture={onRowMouseDownCapture}
      className={clsx(
        'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-150 ease-in-out rounded-lg w-full text-left',
        isActive ? 'bg-gray-100 ring-1 ring-gray-200' : 'hover:bg-gray-50'
      )}
    >
      {rowAvatar ? (
        <SafeImage
          src={rowAvatar}
          alt={`${rowName} avatar`}
          width={40}
          height={40}
          sizes="40px"
          loading="lazy"
          className={clsx('rounded-full object-cover flex-shrink-0 border border-gray-200')}
        />
      ) : (
        <div className={clsx('h-10 w-10 rounded-full bg-black text-white flex-shrink-0 flex items-center justify-center font-medium text-lg')}>
          {rowName.charAt(0)}
        </div>
      )}

      <div className="flex-1 overflow-hidden min-w-0">
        <div className={clsx('flex items-center justify-between', p.isUnread ? 'font-semibold text-gray-900' : 'text-gray-700')}>
          <span className="truncate flex items-center gap-2 min-w-0">
            <span className="truncate">
              {q && partsName.has ? (
                <>
                  {partsName.before}
                  <span className="bg-yellow-100 text-yellow-800 rounded px-0.5">{partsName.match}</span>
                  {partsName.after}
                </>
              ) : rowName}
            </span>
          </span>
          <time dateTime={p.date} className={clsx('text-xs flex-shrink-0 ml-2', p.isUnread ? 'font-semibold text-gray-900' : 'text-gray-500')}>
            {formatThreadTime(p.date)}
          </time>
        </div>
        <div className={clsx('text-xs', p.isUnread ? 'font-semibold text-gray-800' : 'text-gray-600', 'flex items-start justify-between gap-3')}>
          <span className="inline-flex items-center gap-2 min-w-0 flex-1 truncate">
            {p.isBookaModeration && (
              <span className="inline-flex items-center gap-1 rounded bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0">BOOKA</span>
            )}
            {p.isSupplierInvite && (
              <span className="inline-flex items-center gap-1 rounded bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0">SUPPLIER</span>
            )}
            {p.showEvent && (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0">EVENT</span>
            )}
            {p.showVideo && (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0">VIDEO</span>
            )}
            {!p.showEvent && !p.showVideo && p.isQuote && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0">QUOTE</span>
            )}
            {!p.showEvent && !p.showVideo && !p.isQuote && p.showInquiry && (
              <span className="inline-flex items-center gap-1 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0">INQUIRY</span>
            )}
            <span className="truncate">
              {p.isBookaModeration ? (
                q && partsPrev.has ? (
                  <>
                    {partsPrev.before}
                    <span className="bg-yellow-100 text-yellow-800 rounded px-0.5">{partsPrev.match}</span>
                    {partsPrev.after}
                  </>
                ) : (
                  <span className="text-indigo-800 font-medium">{p.preview}</span>
                )
              ) : p.isSupplierInvite ? (
                <span className="text-purple-800 font-medium">
                  {p.supplierProgram
                    ? t('inbox.supplierInvitePreview', 'Preferred supplier · {program}', { program: p.supplierProgram })
                    : t('inbox.supplierInvitePreviewGeneric', 'Preferred supplier invite')}
                </span>
              ) : q && partsPrev.has ? (
                <>
                  {partsPrev.before}
                  <span className="bg-yellow-100 text-yellow-800 rounded px-0.5">{partsPrev.match}</span>
                  {partsPrev.after}
                </>
              ) : (
                p.preview
              )}
            </span>
          </span>
          {p.unreadCount > 0 ? (
            <span aria-label={`${p.unreadCount} unread messages`} className={clsx('ml-2 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-black text-white', 'min-w-[20px] h-5 px-1 text-[11px] font-semibold')}>
              {p.unreadCount > 99 ? '99+' : p.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}, (prev, next) => {
  // Stable index and style?
  if (prev.index !== next.index) return false;
  if (prev.style !== next.style) return false;
  const prevData = prev.data as RowData;
  const nextData = next.data as RowData;
  const prevItem = prevData.items[prev.index];
  const nextItem = nextData.items[next.index];
  if (!prevItem || !nextItem) return false;
  const id = nextItem.id;
  const wasActive = prevData.selectedId === id;
  const isActive = nextData.selectedId === id;
  if (wasActive !== isActive) return false;
  // If the precomputed blob for this row changed identity, re-render
  if (prevData.pre[id] !== nextData.pre[id]) return false;
  // Otherwise skip re-render
  return true;
});

// Provide itemData with stable handlers to avoid per-row closures
function useRowData(bookingRequests: BookingRequest[], selectedId: number | null, onSelect: (id: number) => void, pre: Record<number, PreRow>, q: string): RowData {
  const onRowClick = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const id = Number((e.currentTarget as HTMLButtonElement).dataset.id);
    if (!Number.isFinite(id)) return;
    onSelect(id);
  }, [onSelect]);
  const onRowKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const id = Number((e.currentTarget as HTMLButtonElement).dataset.id);
    if (!Number.isFinite(id)) return;
    onSelect(id);
  }, [onSelect]);
  const onRowPointerDown = React.useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const t = e.target as HTMLElement;
    if (t && t.closest && t.closest('a')) return;
    const id = Number((e.currentTarget as HTMLButtonElement).dataset.id);
    if (!Number.isFinite(id)) return;
    onSelect(id);
  }, [onSelect]);
  const onRowMouseDownCapture = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const t = e.target as HTMLElement;
    if (t && t.closest && t.closest('a')) {
      e.preventDefault();
      e.stopPropagation();
      const id = Number((e.currentTarget as HTMLButtonElement).dataset.id);
      if (Number.isFinite(id)) onSelect(id);
    }
  }, [onSelect]);
  const onRowMouseEnter = React.useCallback(() => {}, []);
  return React.useMemo<RowData>(() => (
    { items: bookingRequests, selectedId, onSelect, pre, q, onRowClick, onRowKeyDown, onRowPointerDown, onRowMouseDownCapture, onRowMouseEnter }
  ), [bookingRequests, selectedId, onSelect, pre, q, onRowClick, onRowKeyDown, onRowPointerDown, onRowMouseDownCapture, onRowMouseEnter]);
}

// End
