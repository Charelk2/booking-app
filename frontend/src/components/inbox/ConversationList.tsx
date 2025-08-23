'use client';

import clsx from 'clsx';
import Image from 'next/image';
import { formatRelative } from 'date-fns';
import { BookingRequest, User } from '@/types';
import { getFullImageUrl } from '@/lib/utils'; // Import getFullImageUrl
import { FixedSizeList as List, type ListChildComponentProps } from 'react-window';
import React from 'react';

interface ConversationListProps {
  bookingRequests: BookingRequest[];
  selectedRequestId: number | null;
  onSelectRequest: (id: number) => void;
  currentUser?: User | null;
  query?: string;
  height?: number;
}

export default function ConversationList({
  bookingRequests,
  selectedRequestId,
  onSelectRequest,
  currentUser,
  query = '',
  height,
}: ConversationListProps) {
  if (!currentUser) {
    return null;
  }
  const ROW_HEIGHT = 74;
  const STORAGE_KEY = 'inbox:convListOffset';
  const STORAGE_TOP_ID = 'inbox:convListTopId';
  const STORAGE_TOP_INDEX = 'inbox:convListTopIndex';

  // Persist scroll position so selecting a convo doesn't jump to top.
  const listRef = React.useRef<List>(null);
  const restoredRef = React.useRef(false);
  const lastVisibleStartRef = React.useRef(0);
  const initialOffset = React.useMemo(() => {
    if (typeof window === 'undefined') return 0;
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  }, []);

  const q = query.trim().toLowerCase();
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

  const listHeight = height ?? Math.min(ROW_HEIGHT * bookingRequests.length, ROW_HEIGHT * 10);

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
      itemKey={(index) => bookingRequests[index]?.id ?? index}
      onScroll={(ev: { scrollOffset: number }) => {
        try { sessionStorage.setItem(STORAGE_KEY, String(ev.scrollOffset)); } catch {}
      }}
      onItemsRendered={({ visibleStartIndex }) => {
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
      {({ index, style }: ListChildComponentProps) => {
        const req = bookingRequests[index];
        const isActive = selectedRequestId === req.id;
        const isUnread = (() => {
          const v = (req as any).is_unread_by_current_user;
          if (v === true || v === 1 || v === '1' || v === 'true') return true;
          return false;
        })();
        const rawOtherName = (() => {
          if (currentUser.user_type === 'service_provider') {
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

        const avatarUrl =
          currentUser.user_type === 'service_provider'
            ? req.client?.profile_picture_url
            : req.artist_profile?.profile_picture_url || req.artist?.profile_picture_url;

        const date =
          req.last_message_timestamp || req.updated_at || req.created_at;

        const previewMessage = (() => {
          if (
            req.last_message_content === 'Artist sent a quote' ||
            req.last_message_content === 'Service Provider sent a quote'
          ) {
            return currentUser.user_type === 'service_provider'
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
          const text = (req.last_message_content || '').toString();
          if (!text) return false;
          return /\bquote\b/i.test(text);
        })();

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
            onClickCapture={(e) => {
              // Ensure row selection always handles navigation within SPA
              e.preventDefault();
              e.stopPropagation();
              onSelectRequest(req.id);
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
            {avatarUrl ? (
              <Image
                src={getFullImageUrl(avatarUrl) as string}
                alt={`${otherName} avatar`}
                width={40}
                height={40}
                loading="lazy"
                className={clsx('rounded-full object-cover flex-shrink-0 border border-gray-200')}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = getFullImageUrl('/static/default-avatar.svg') as string;
                }}
              />
            ) : (
              <div className={clsx('h-10 w-10 rounded-full bg-black text-white flex-shrink-0 flex items-center justify-center font-medium text-lg')}>
                {otherName.charAt(0)}
              </div>
            )}
            
            <div className="flex-1 overflow-hidden min-w-0">
              <div className={clsx(
                'flex items-center justify-between',
                isUnread ? 'font-semibold text-gray-900' : 'text-gray-700'
              )}>
                <span className="truncate flex items-center gap-2 min-w-0">
                  <span className="truncate">{q ? highlight(otherName) : otherName}</span>
                </span>
                <time
                  dateTime={date}
                  className="text-xs text-gray-500 flex-shrink-0 ml-2" // Added ml-2 for spacing
                >
                  {formatRelative(new Date(date), new Date())}
                </time>
              </div>
              <div
                className={clsx(
                  'text-xs truncate',
                  isUnread
                    ? 'font-semibold text-gray-800'
                    : 'text-gray-600' // Stronger font for unread message content
                )}
              >
                <span className="inline-flex items-center gap-2 min-w-0">
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
                  <span className="truncate">
                    {q ? highlight(previewMessage) : previewMessage}
                  </span>
                </span>
              </div>
            </div>
            {/* Unread dot (subtle) */}
            {isUnread && (
              <span className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 ml-2" aria-label="Unread message" />
            )}
          </div>
        );
      }}
    </List>
  );
}
