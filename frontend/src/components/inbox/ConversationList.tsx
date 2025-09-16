'use client';

import clsx from 'clsx';
import SafeImage from '@/components/ui/SafeImage';
import { BookingRequest, User } from '@/types';
import { FixedSizeList as List } from 'react-window';
import type { CSSProperties } from 'react';
import React from 'react';

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
  const formatThreadTime = (iso: string | null | undefined): string => {
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
  };
  const highlight = (text: string) => {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    return (
      <>
        {before}
        <span className="bg-yellow-100 text-yellow-800 rounded px-0.5">{match}</span>
        {after}
      </>
    );
  };
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
  React.useLayoutEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const n = raw ? Number(raw) : 0;
      if (listRef.current) {
        const topId = sessionStorage.getItem(STORAGE_TOP_ID);
        if (topId) {
          const index = bookingRequests.findIndex((r) => String(r.id) === topId);
          if (index >= 0) {
            try { (listRef.current as any).scrollToItem?.(index, 'start'); return; } catch {}
          }
        }
        if (Number.isFinite(n) && n >= 0) {
          const idx = Math.max(0, Math.round(n / ROW_HEIGHT));
          try { (listRef.current as any).scrollToItem?.(idx, 'start'); } catch { listRef.current.scrollTo(n); }
        }
      }
    } catch {}
  }, [selectedRequestId, bookingRequests]);

  // Auto-height by default: expand to fit all rows so the list doesn't force its own scrollbar.
  // If a specific height is provided via prop, honor it.
  const listHeight = height ?? ROW_HEIGHT * bookingRequests.length;

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
      overscanCount={6}
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
    >
      {({ index, style }: { index: number; style: CSSProperties }) => {
        const req = bookingRequests[index];
        const isActive = selectedRequestId === req.id;
        const isUnread = (() => {
          const v = (req as any).is_unread_by_current_user;
          if (v === true || v === 1 || v === '1' || v === 'true') return true;
          return false;
        })();
        const isArtist = currentUser?.user_type === 'service_provider';
        const rawOtherName = (() => {
          if (isArtist) {
            return req.client?.first_name || 'Client';
          }
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
        const otherName = String(rawOtherName || '');

        const avatarUrl = isArtist
          ? req.client?.profile_picture_url
          : req.artist_profile?.profile_picture_url || req.artist?.profile_picture_url;

        const date =
          req.last_message_timestamp || req.updated_at || req.created_at;

        const previewMessage = (() => {
          if (
            req.last_message_content === 'Artist sent a quote' ||
            req.last_message_content === 'Service Provider sent a quote'
          ) {
            return isArtist
              ? 'You sent a quote'
              : `${otherName} sent a quote`;
          }
          return (
            req.last_message_content ??
            req.service?.title ??
            req.message ??
            'New Request'
          );
        })();

        const serviceType = (req.service?.service_type || '').toString();
        const isPersonalizedVideo = serviceType.toLowerCase() === 'personalized video';
        // Determine paid/confirmed state for events (non-PV)
        const paidOrConfirmed = (() => {
          const text = (req.last_message_content || '').toString();
          const status = (req.status || '').toString().toLowerCase();
          const hasAcceptedQuote = (req.accepted_quote_id as unknown as number) ? true : false;
          const paidMsg = /payment\s*received|booking\s*confirmed/i.test(text);
          const confirmed = ['confirmed', 'completed', 'request_confirmed', 'request_completed'].includes(status);
          let localFlag = false;
          try {
            if (typeof window !== 'undefined') {
              localFlag = !!localStorage.getItem(`booking-confirmed-${req.id}`);
            }
          } catch {}
          return paidMsg || confirmed || hasAcceptedQuote || localFlag;
        })();
        // VIDEO badge: for PV, chat opens after payment, so always show VIDEO.
        // Fallback: if service is missing but we created a video order mapping client-side, show VIDEO.
        const showVideoBadge = (() => {
          if (isPersonalizedVideo) return true;
          try {
            if (typeof window !== 'undefined') {
              const oid = localStorage.getItem(`vo-order-for-thread-${req.id}`);
              if (oid) return true;
            }
          } catch {}
          return false;
        })();
        const showEventBadge = !showVideoBadge && paidOrConfirmed;
        const isQuote = (() => {
          // Prefer explicit signals over fuzzy text matching
          const threadState = String(((req as any).thread_state ?? '') || '').toLowerCase();
          if (threadState === 'quoted') return true;
          const hasAcceptedQuote = (req.accepted_quote_id as unknown as number) ? true : false;
          const hasQuotesArr = Array.isArray((req as any).quotes) && (req as any).quotes.length > 0;
          if (hasAcceptedQuote || hasQuotesArr) return true;
          const text = (req.last_message_content || '').toString();
          return /(sent a quote|quote sent|provided a quote|new quote)/i.test(text);
        })();

        // Show INQUIRY only for message-started threads (never booking wizard)
        const showInquiryBadge = (() => {
          if (showEventBadge || showVideoBadge || isQuote) return false;
          const threadState = String(((req as any).thread_state ?? '') || '').toLowerCase();
          const status = (req.status || '').toString().toLowerCase();
          const hasBookingDetails = Boolean((req as any).proposed_datetime_1 || (req as any).proposed_datetime_2 || (req as any).travel_breakdown);
          const hasQuotes = Boolean((req as any).accepted_quote_id) || (Array.isArray((req as any).quotes) && (req as any).quotes.length > 0) || threadState === 'quoted';
          // First, honor explicit inquiry signals
          if ((req as any).has_inquiry_card === true) return true;
          try {
            if (typeof window !== 'undefined') {
              const local = localStorage.getItem(`inquiry-thread-${req.id}`);
              if (local) return true;
            }
          } catch {}
          // Otherwise, if there are any booking-like signals, do not show INQUIRY
          if (hasBookingDetails || hasQuotes || status.includes('pending_quote')) return false;
          return false;
        })();

        // Listing moderation chips from system preview text; or explicit flag from synthetic rows
        const isSyntheticBooka = Boolean((req as any).is_booka_synthetic);
        const showApprovedChip = /^\s*listing\s+approved:/i.test((previewMessage || '').toString());
        const showRejectedChip = /^\s*listing\s+rejected:/i.test((previewMessage || '').toString());

        // Override display for Booka moderation previews
        let rowName = otherName;
        let rowAvatar = avatarUrl as string | undefined | null;
        const isBookaModeration = isSyntheticBooka || showApprovedChip || showRejectedChip;
        if (isBookaModeration) {
          rowName = 'Booka';
          rowAvatar = undefined; // fall back to letter avatar 'B'
        }

        return (
          <div
            style={style}
            key={req.id}
            role="option"
            aria-selected={isActive}
            tabIndex={0}
            onClick={() => onSelectRequest(req.id)}
            onMouseDownCapture={(e) => {
              const t = e.target as HTMLElement;
              // If a link is clicked inside the row (e.g., auto-linked URL in preview), prevent navigation.
              if (t && t.closest && t.closest('a')) {
                e.preventDefault();
                e.stopPropagation();
                onSelectRequest(req.id);
              }
            }}
            
            onKeyPress={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onSelectRequest(req.id);
              }
            }}
            // Apply hover and active states clearly
            className={clsx(
              'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-150 ease-in-out rounded-lg',
              isActive
                ? 'bg-gray-100 ring-1 ring-gray-200'
                : 'hover:bg-gray-50'
            )}
          >
            {/* Avatar Handling */}
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
              <div className={clsx(
                'flex items-center justify-between',
                isUnread ? 'font-semibold text-gray-900' : 'text-gray-700'
              )}>
                <span className="truncate flex items-center gap-2 min-w-0">
                  <span className="truncate">{q ? highlight(rowName) : rowName}</span>
                </span>
                <time
                  dateTime={date}
                  className={clsx(
                    'text-xs flex-shrink-0 ml-2',
                    isUnread ? 'font-semibold text-gray-900' : 'text-gray-500'
                  )}
                >
                  {formatThreadTime(date)}
                </time>
              </div>
              <div
                className={clsx(
                  'text-xs',
                  isUnread ? 'font-semibold text-gray-800' : 'text-gray-600',
                  'flex items-start justify-between gap-3'
                )}
              >
                <span className="inline-flex items-center gap-2 min-w-0 flex-1 truncate">
                  {showEventBadge && (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0">
                      EVENT
                    </span>
                  )}
                  {showVideoBadge && (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0">
                      VIDEO
                    </span>
                  )}
                  {!showEventBadge && !showVideoBadge && isQuote && (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0">
                      QUOTE
                    </span>
                  )}
                  {!showEventBadge && !showVideoBadge && !isQuote && showInquiryBadge && (
                    <span className="inline-flex items-center gap-1 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0">
                      INQUIRY
                    </span>
                  )}
                  {/* Suppress APPROVED/REJECTED chips for Booka moderation threads */}
                  <span className="truncate">
                    {(() => {
                      const base = q ? highlight(previewMessage) : previewMessage;
                      const isBookaModeration = showApprovedChip || showRejectedChip;
                      return isBookaModeration ? (
                        <>
                          <span className="text-[10px] font-semibold text-indigo-700 mr-1">Booka •</span> {base}
                        </>
                      ) : base;
                    })()}
                  </span>
                </span>
                {(() => {
                  const unreadCount = Number((req as any).unread_count || 0);
                  return unreadCount > 0 ? (
                    <span
                      aria-label={`${unreadCount} unread messages`}
                      className={clsx(
                        'ml-2 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-black text-white',
                        'min-w-[20px] h-5 px-1 text-[11px] font-semibold'
                      )}
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  ) : null;
                })()}
              </div>
            </div>
            {/* Unread dot removed in favor of count badge */}
          </div>
        );
      }}
    </List>
  );
}
