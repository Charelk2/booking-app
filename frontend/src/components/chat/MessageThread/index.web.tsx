// components/chat/MessageThread/index.web.tsx
// Ultra-optimized web orchestrator for chat threads.
// - Loop-safe, GC-friendly, virtualization-aware
// - Stable callbacks to prevent adapter churn
// - Strict anchoring logic + smooth follow behavior
// - Correct paid-state detection (fixed placement)
// - Reduced layout thrash (ResizeObserver + batched scroll ops)
// - Defensive guards around DOM access + realtime health fallbacks

'use client';

import * as React from 'react';
import ThreadView from './ThreadView';
import PlainList from './list-adapter/PlainList.web';
import VirtuosoList from './list-adapter/VirtuosoList.web';
import type { ChatListHandle } from './list-adapter/ChatListHandle';

import { useAnchoredChat } from './hooks/useAnchoredChat';
import { useThreadData } from './hooks/useThreadData';
import { useThreadReadManager } from './hooks/useThreadReadManager';
import { useThreadRealtime } from './hooks/useThreadRealtime';

import { groupMessages } from './grouping/groupMessages';
import GroupRenderer from './message/GroupRenderer';

import { isImage, isVideo } from './utils/media';
import axios from 'axios';
import { selectAdapter } from './utils/adapter';
import { isAtBottom as isAtBottomUtil } from './utils/scroll';

import { Spinner } from '@/components/ui';
import Composer from './composer/Composer';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeContext } from '@/contexts/chat/RealtimeContext';
import { useQuotes } from '@/hooks/useQuotes';

import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';
import { parseBookingDetailsFromMessage } from '@/lib/chat/bookingDetails';
import { safeParseDate } from '@/lib/chat/threadStore';
import { getSummaries as cacheGetSummaries, subscribe as cacheSubscribe } from '@/lib/chat/threadCache';

import { format } from 'date-fns';
import { readThreadCache } from '@/lib/chat/threadCache';
import { initAttachmentMessage, finalizeAttachmentMessage } from '@/lib/api';
import { useDeclineQuote } from '@/hooks/useQuoteActions';
import useTransportState from '@/hooks/useTransportState';
import { emitThreadsUpdated } from '@/lib/chat/threadsEvents';
import EventPrepCard from '@/components/booking/EventPrepCard';

// ————————————————————————————————————————————————————————————————
// Small utilities

function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  ref.current = value;
  return ref;
}

function useStableCallback<T extends (...args: any[]) => any>(fn: T) {
  const fnRef = useLatest(fn);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return React.useCallback(((...args: any[]) => fnRef.current(...args)) as T, []);
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// Light throttle for events like typing so we don’t spam the backend.
function useThrottled<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  const lastRef = React.useRef(0);
  const fnRef = useLatest(fn);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return React.useCallback(((...args: any[]) => {
    const now = Date.now();
    if (now - lastRef.current >= ms) {
      lastRef.current = now;
      fnRef.current(...args);
    }
  }) as T, [ms]);
}

// ————————————————————————————————————————————————————————————————
// Types (minimal, local)

type ReplyTarget = { id: number; sender_type: string; content: string } | null;
type GalleryItem = { src: string; type: 'image' | 'video' };

export type MessageThreadWebProps = {
  bookingRequestId: number;
  isActive?: boolean;
  clientName?: string;
  clientAvatarUrl?: string;
  artistName?: string;
  artistAvatarUrl?: string;
  onPayNow?: (quote: any) => void;
  onOpenDetailsPanel?: () => void;
  onOpenQuote?: () => void;
  onPresenceUpdate?: (state: { label: string; typing?: boolean; status?: string | null }) => void;
  // Optional UI hint to mark quotes as Paid (e.g., right after verify)
  isPaidOverride?: boolean;
  // Optional initial request snapshot (threads list payload)
  initialBookingRequest?: any;
  // Optional handler to resolve and navigate to Event Prep when booking_id not yet known
  onContinueEventPrep?: (bookingRequestId: number) => void;
  // allow passthrough
  [k: string]: any;
};

// ————————————————————————————————————————————————————————————————
// Component

export default function MessageThreadWeb(props: MessageThreadWebProps) {
  const {
    bookingRequestId,
    isActive = true,
    clientName,
    clientAvatarUrl,
    artistName,
    artistAvatarUrl,
    onPayNow,
    onOpenDetailsPanel,
    onOpenQuote,
    onPresenceUpdate,
    isPaidOverride,
    initialBookingRequest,
    onContinueEventPrep,
  } = props;

  // ——— Auth / identity
  const { user } = useAuth();
  const transport = useTransportState();
  const myUserId = Number(user?.id || 0);
  const userType = (user?.user_type as any) || 'client';

  // ——— Realtime
  const { publish, status: rtStatus, mode: rtMode, failureCount: rtFailures } = useRealtimeContext();

  // ——— Anchoring + list control
  const listRef = React.useRef<ChatListHandle | null>(null);
  const {
    setAtBottom,
    followOutput,
    onBeforePrepend,
    onAfterPrepend,
    applyComposerDelta,
    suppressFollowFor,
    preserveAnchorOnce,
    scheduleScrollToEndSmooth,
  } = useAnchoredChat(listRef);

  // ——— Local UI state
  const composerRef = React.useRef<HTMLDivElement | null>(null);
  const [replyTarget, setReplyTarget] = React.useState<ReplyTarget>(null);
  const [highlightId, setHighlightId] = React.useState<number | null>(null);
  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const [newAnchorId, setNewAnchorId] = React.useState<number | null>(null);

  // ——— Server data (messages + helpers)
  const {
    messages,
    setMessages,
    loading,
    loadingOlder,
    reachedHistoryStart,
    fetchOlder,
    fetchMessages,
    handlers,
  } = useThreadData(bookingRequestId, { isActiveThread: isActive, onMessagesFetched: () => {} });

  // ——— Virtualization selection (stable)
  const ListComponent = React.useMemo(() => {
    const count = Array.isArray(messages) ? messages.length : 0;
    return selectAdapter(count) === 'virtuoso' ? VirtuosoList : PlainList;
  }, [messages]);

  // ——— Quotes
  const { quotesById, ensureQuoteLoaded, setQuote } = useQuotes(bookingRequestId) as any;
  const declineQuote = useDeclineQuote();
  const onDecline = useStableCallback((q: any) => {
    try {
      const qid = Number(q?.id || q?.quote_id || 0);
      if (!Number.isFinite(qid) || qid <= 0) return;
      void (async () => {
        try {
          await declineQuote(qid);
          try { setQuote?.({ ...(q as any), id: qid, status: 'rejected' }); } catch {}
          try { await ensureQuoteLoaded(qid); } catch {}
          try { emitThreadsUpdated({ threadId: bookingRequestId, reason: 'quote_declined', immediate: true }, { immediate: true, force: true }); } catch {}
        } catch {
          // swallow; UI will remain unchanged and can retry
        }
      })();
    } catch {}
  });

  // ————————————————————————————————————————————————————————————————
  // Presence / typing header label derived from threadStore
  const messagesRef = useLatest(messages);
  // Debounce reaction toggles per message id to avoid rapid double-taps
  const lastReactionToggleRef = React.useRef<Record<number, number>>({});

  React.useEffect(() => {
    if (!onPresenceUpdate) return;

    const computePresence = () => {
      try {
        const t = (cacheGetSummaries() as any[]).find((s) => Number(s?.id) === Number(bookingRequestId)) as any;
        const typing = Boolean(t?.typing);
        const presence: string | null = (t?.presence ?? null) as any; // e.g., 'online'
        const lastPresenceAt: number | null = (t?.last_presence_at ?? null) as any;

        // 1) Typing overrides everything
        if (typing) {
          onPresenceUpdate({ label: 'typing…', typing: true, status: presence === 'online' ? 'online' : null });
          return;
        }

        // 2) If explicitly online
        if (typeof presence === 'string' && presence.trim().toLowerCase() === 'online') {
          onPresenceUpdate({ label: 'Online', typing: false, status: 'online' });
          return;
        }

        // 3) Last seen fallback (presence timestamp or last counterparty message)
        let base: Date | null = null;
        if (Number.isFinite(lastPresenceAt) && (lastPresenceAt as any) > 0) {
          base = new Date(Number(lastPresenceAt));
        }
        if (!base) {
          const list = messagesRef.current as any[] | undefined;
          if (Array.isArray(list) && list.length) {
            for (let i = list.length - 1; i >= 0; i -= 1) {
              const m: any = list[i];
              const senderId = Number(m?.sender_id || 0);
              if (!Number.isFinite(senderId) || senderId === myUserId) continue;
              const ts = String(m?.timestamp || '');
              const dt = safeParseDate(ts);
              if (Number.isFinite(dt.getTime())) {
                base = dt;
                break;
              }
            }
          }
        }
        let label = '';
        if (base && Number.isFinite(base.getTime())) {
          const now = new Date();
          const sameDay =
            base.getFullYear() === now.getFullYear() &&
            base.getMonth() === now.getMonth() &&
            base.getDate() === now.getDate();
          label = sameDay ? `Last seen ${format(base, 'HH:mm')}` : `Last seen ${format(base, 'd LLL HH:mm')}`;
        }
        onPresenceUpdate({ label, typing: false, status: null });
      } catch {
        // no-op
      }
    };

    computePresence();
    const unsub = cacheSubscribe(() => computePresence());
    return () => {
      try {
        unsub?.();
      } catch {}
    };
  }, [bookingRequestId, onPresenceUpdate, myUserId, messagesRef]);

  // ————————————————————————————————————————————————————————————————
  // Track bottom/anchor state + detect tail appends

  const switchedUntilRef = React.useRef<number>(0);
  const isAtBottomRef = useLatest(isAtBottom);
  const lastSwitchAtRef = React.useRef<number>(Date.now());

  React.useEffect(() => {
    lastSwitchAtRef.current = Date.now();
  }, [bookingRequestId]);

  const lastTailIdRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const list = messagesRef.current as any[] | undefined;
    if (!Array.isArray(list) || list.length === 0) {
      lastTailIdRef.current = null;
      return;
    }
    const prevTail = lastTailIdRef.current;
    const currTail = Number((list[list.length - 1] as any)?.id ?? NaN);

    // Append detection: strictly increasing tail id
    if (Number.isFinite(prevTail) && Number.isFinite(currTail) && currTail > (prevTail as number)) {
      const now = Date.now();
      const rtHealthy = rtMode === 'ws' && rtStatus === 'open' && (rtFailures || 0) === 0;

      // Within post-switch grace: force follow
      if (now < switchedUntilRef.current) {
        try {
          setAtBottom(true);
          scheduleScrollToEndSmooth();
        } catch {}
        setNewAnchorId(null);
      } else if (!isAtBottomRef.current) {
        // Not at bottom → mark first new id for divider
        const firstNew = list.find((m: any) => Number(m?.id) > (prevTail as number));
        const id = Number(firstNew?.id);
        if (Number.isFinite(id) && id > 0) setNewAnchorId((old) => old ?? id);

        // If realtime degraded, schedule a reconciliation fetch quickly (edge-case safety)
        if (!rtHealthy) {
          // Throttled via lastReactionRefreshRef below to avoid storms
          const now2 = Date.now();
          if (now2 - lastReactionRefreshRef.current > 1000) {
            lastReactionRefreshRef.current = now2;
            try {
              fetchMessagesRef.current({ mode: 'incremental', force: true, reason: 'rt-append', limit: 500 });
            } catch {}
          }
        }
      }
    }
    lastTailIdRef.current = Number.isFinite(currTail) ? currTail : prevTail ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesRef.current, rtMode, rtStatus, rtFailures]);

  // ————————————————————————————————————————————————————————————————
  // Grouping (pure; only input identity changes should recompute)
  const shouldShowTimestampGroup = React.useCallback(() => true, []);
  const groups = React.useMemo(
    () => groupMessages(messages as any, shouldShowTimestampGroup as any),
    [messages, shouldShowTimestampGroup],
  );

  // ————————————————————————————————————————————————————————————————
  // Media gallery (images + videos; exclude voice/audio)
  const galleryItems = React.useMemo<GalleryItem[]>(() => {
    const out: GalleryItem[] = [];
    const seen = new Set<string>();
    const list = Array.isArray(messages) ? messages : [];
    for (const m of list as any[]) {
      const url = (m?.attachment_url || '').toString();
      if (!url) continue;
      const meta = (m as any)?.attachment_meta as { content_type?: string; original_filename?: string } | undefined;
      const filename = (meta?.original_filename || '').toString().toLowerCase();
      const text = (m?.content || '').toString().toLowerCase();
      const pathLower = url.toLowerCase();
      const ct = (meta?.content_type || '').toLowerCase().split(';')[0].trim();

      // Protect against mislabeled voice notes
      const looksLikeVoice =
        filename.includes('voice') ||
        filename.includes('voicenote') ||
        text.includes('voice') ||
        text.includes('voicenote') ||
        pathLower.includes('/voice-notes/') ||
        pathLower.includes('/voice/') ||
        pathLower.includes('voicenote');

      let type: 'image' | 'video' | null = null;
      if (ct.startsWith('image/')) type = 'image';
      else if (ct.startsWith('video/')) type = looksLikeVoice ? null : 'video';
      else if (!ct) {
        if (isImage(url)) type = 'image';
        else if (isVideo(url)) type = looksLikeVoice ? null : 'video';
      }
      if (!type) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ src: url, type });
    }
    return out;
  }, [messages]);

  // ————————————————————————————————————————————————————————————————
  // Local message lookup for reply preview resolution
  const messageLookup = React.useMemo(() => {
    const map = new Map<number, any>();
    try {
      const list = Array.isArray(messages) ? messages : [];
      for (const m of list as any[]) {
        const id = Number((m as any)?.id || 0);
        if (Number.isFinite(id) && id > 0) map.set(id, m);
      }
    } catch {}
    return map;
  }, [messages]);

  const resolveReplyPreview = React.useCallback(
    (rid: number) => {
      const target = messageLookup.get(Number(rid));
      if (!target) return null;
      const text = String(target?.content || '').trim();
      if (text) return text.slice(0, 140);

      const meta = (target as any)?.attachment_meta as { content_type?: string; original_filename?: string } | undefined;
      const ct = (meta?.content_type || '').toLowerCase().split(';')[0].trim();
      const url = String((target as any)?.attachment_url || '');
      if (ct.startsWith('image/') || isImage(url)) return 'Photo';
      if (ct.startsWith('video/') || isVideo(url)) return 'Video';
      if (ct.startsWith('audio/')) return 'Audio';
      if (Number((target as any)?.quote_id || 0) > 0) return 'Quote';
      if (url) return meta?.original_filename || 'Attachment';
      return 'Message';
    },
    [messageLookup],
  );

  // ————————————————————————————————————————————————————————————————
  // Initial + thread switch fetch
  React.useEffect(() => {
    const MIN_CURSOR_MESSAGES = 200;
    let hasCursor = false;
    try {
      const inState = Array.isArray(messages) ? messages.length : 0;
      let cached = 0;
      try {
        const arr = readThreadCache(bookingRequestId);
        if (Array.isArray(arr)) cached = arr.length;
      } catch {}
      hasCursor = inState >= MIN_CURSOR_MESSAGES || cached >= MIN_CURSOR_MESSAGES;
    } catch {}

    void fetchMessages({
      mode: hasCursor ? 'incremental' : 'initial',
      force: true,
      reason: 'orchestrator-mount',
      limit: 500,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingRequestId]);

  // ——— Visibility-triggered refresh (throttled)
  const fetchMessagesRef = useLatest(fetchMessages);
  const throttleRef = React.useRef<number>(0);
  const lastReactionRefreshRef = React.useRef<number>(0);

  const onVisible = React.useCallback(() => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState !== 'visible') return;

    const now = Date.now();
    if (now - lastSwitchAtRef.current < 1500) return; // avoid immediately after thread switch
    if (now - throttleRef.current < 1000) return; // 1s guard
    throttleRef.current = now;

    const list = messagesRef.current;
    const MIN_CURSOR_MESSAGES = 200;
    const hasCursor = Array.isArray(list) && list.length >= MIN_CURSOR_MESSAGES;

    void fetchMessagesRef.current({
      mode: hasCursor ? 'incremental' : 'initial',
      force: true,
      reason: 'orchestrator-visible',
      limit: 500,
    });
  }, [messagesRef, fetchMessagesRef]);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [onVisible]);

  // ——— Ensure we land at the bottom when switching to an active thread
  React.useEffect(() => {
    if (!isActive) return;
    try {
      setAtBottom(true);
      // Defer so measurements settle
      requestAnimationFrame(() => {
        try {
          const scroller = listRef.current?.getScroller?.();
          if (scroller) {
            const alreadyAtBottom = isAtBottomUtil(scroller);
            if (!alreadyAtBottom) scheduleScrollToEndSmooth();
          } else {
            scheduleScrollToEndSmooth();
          }
        } catch {}
      });
      // Late-arriving first append will auto-follow within this window
      switchedUntilRef.current = Date.now() + 1500;
    } catch {}
  }, [bookingRequestId, isActive, setAtBottom, scheduleScrollToEndSmooth]);

  // ————————————————————————————————————————————————————————————————
  // Booking details → immediate side panel update (idempotent)
  const onParsedCbRef = useLatest((props as any)?.onBookingDetailsParsed as undefined | ((parsed: any) => void));
  const lastParsedMsgIdRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    try {
      const cb = onParsedCbRef.current;
      if (!cb) return;
      const list = Array.isArray(messages) ? messages : [];
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const m: any = list[i];
        if (String(m?.message_type || '').toUpperCase() !== 'SYSTEM') continue;
        const text = String(m?.content || '');
        if (!text.startsWith(BOOKING_DETAILS_PREFIX)) continue;
        const mid = Number(m?.id || 0);
        if (Number.isFinite(mid) && lastParsedMsgIdRef.current === mid) return; // already parsed
        const parsed = parseBookingDetailsFromMessage(text);
        lastParsedMsgIdRef.current = Number.isFinite(mid) ? mid : lastParsedMsgIdRef.current;
        cb(parsed);
        break;
      }
    } catch {}
  }, [messages, onParsedCbRef]);

  // ————————————————————————————————————————————————————————————————
  // Paid state (FIX: must be inside component; previously out-of-scope)
  const isPaidFromMessages = React.useMemo(() => {
    try {
      const list = Array.isArray(messages) ? messages : [];
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const m: any = list[i];
        if (String(m?.message_type || '').toUpperCase() !== 'SYSTEM') continue;
        const text = String(m?.content || '').toLowerCase();
        if (text.startsWith('payment received')) return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [messages]);

  const isPaid = Boolean(isPaidOverride) || isPaidFromMessages;

  // ——— Request new quote (client CTA when a quote is expired)
  const requestNewQuote = useStableCallback(() => {
    try {
      (handlers as any).send(
        {
          content: 'New quote requested',
          message_type: 'SYSTEM',
          visible_to: 'both',
          system_key: 'quote_requested_v1',
        },
        {},
      );
    } catch {}
  });

  // Disable "Request new quote" when already requested today
  const disableRequestNewQuote = React.useMemo(() => {
    try {
      const list = Array.isArray(messages) ? messages : [];
      const now = new Date();
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const m: any = list[i];
        const sys = String(m?.message_type || '').toUpperCase() === 'SYSTEM';
        const text = String(m?.content || '').trim().toLowerCase();
        if (!sys) continue;
        if (text !== 'new quote requested') continue;
        const ts = safeParseDate(String(m?.timestamp || ''));
        if (!Number.isFinite(ts.getTime())) break; // older items may lack ts; stop search
        if (
          ts.getFullYear() === now.getFullYear() &&
          ts.getMonth() === now.getMonth() &&
          ts.getDate() === now.getDate()
        ) {
          return true; // already requested today
        }
        break; // found an older request from a previous day
      }
      return false;
    } catch {
      return false;
    }
  }, [messages]);

  // ————————————————————————————————————————————————————————————————
  // Realtime wire-up
  useThreadRealtime({
    threadId: bookingRequestId,
    isActive,
    myUserId,
    ingestMessage: (useStableCallback as any)(handlers.ingestExternalMessage),
    applyReadReceipt: (useStableCallback as any)(handlers.applyReadReceipt),
    applyDelivered: (useStableCallback as any)(handlers.applyDelivered),
    applyReactionEvent: (evt: { messageId: number; emoji: string; userId: number; kind: 'added' | 'removed' }) => {
      const { messageId, emoji, userId, kind } = evt || ({} as any);
      setMessages((prev: any[]) =>
        prev.map((m: any) => {
          if (Number(m?.id) !== Number(messageId)) return m;
          const next: any = { ...m };
          const agg: Record<string, number> = { ...(m.reactions || {}) };
          const mine = new Set<string>((m.my_reactions || []) as string[]);
          if (kind === 'added') {
            agg[emoji] = Number(agg[emoji] || 0) + 1;
            if (Number(userId) === Number(myUserId)) mine.add(emoji);
          } else {
            const curr = Number(agg[emoji] || 0) - 1;
            if (curr > 0) agg[emoji] = curr;
            else delete agg[emoji];
            if (Number(userId) === Number(myUserId) && mine.has(emoji)) mine.delete(emoji);
          }
          next.reactions = agg;
          next.my_reactions = Array.from(mine);
          return next;
        }),
      );

      // If realtime is unhealthy, do a small reconciliation
      const now = Date.now();
      const rtHealthy = rtMode === 'ws' && rtStatus === 'open' && (rtFailures || 0) === 0;
      if (!rtHealthy && now - lastReactionRefreshRef.current > 1000) {
        lastReactionRefreshRef.current = now;
        try {
          fetchMessagesRef.current({ mode: 'incremental', force: true, reason: 'rt-reaction', limit: 500 });
        } catch {}
      }
    },
    applyMessageDeleted: (messageId: number) => {
      setMessages((prev: any[]) =>
        prev.map((m: any) =>
          Number(m?.id) === Number(messageId)
            ? { ...m, _deleted: true, content: '', attachment_url: null, attachment_meta: null, reactions: {}, my_reactions: [] }
            : m,
        ),
      );
    },
  });

  // ——— Read receipts (after realtime hookup so applyReadReceipt exists)
  useThreadReadManager({ threadId: bookingRequestId, messages, isActive, myUserId });

  // ————————————————————————————————————————————————————————————————
  // Scrolling helpers

  const smoothScrollIntoView = React.useCallback((el: HTMLElement, scroller: HTMLElement) => {
    try {
      const elRect = el.getBoundingClientRect();
      const scRect = scroller.getBoundingClientRect();
      const offsetWithin = elRect.top - scRect.top;
      const targetTop =
        (scroller.scrollTop || 0) + offsetWithin - Math.max(0, (scroller.clientHeight - elRect.height) / 2);
      const top = clamp(targetTop, 0, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
      scroller.scrollTo({ top, behavior: 'smooth' });
    } catch {
      try {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {}
    }
  }, []);

  const jumpToMessage = useStableCallback(async (rid: number) => {
    const id = Number(rid);
    if (!Number.isFinite(id) || id <= 0) return;

    try {
      suppressFollowFor(800);
      setAtBottom(false);
    } catch {}

    const scroller = listRef.current?.getScroller?.();
    if (!scroller) return;

    const tryFindAndScroll = () => {
      const node = document.getElementById(`msg-${id}`);
      if (!node) return false;
      smoothScrollIntoView(node, scroller);
      try {
        setHighlightId(id);
      } catch {}
      window.setTimeout(() => {
        try {
          setHighlightId((cur) => (cur === id ? null : cur));
        } catch {}
      }, 2200);
      try {
        (node as HTMLElement).focus({ preventScroll: true });
      } catch {}
      return true;
    };

    if (tryFindAndScroll()) return;

    // Load older pages until found or history start reached (bounded)
    let guard = 0;
    while (guard < 20 && !reachedHistoryStart) {
      guard += 1;
      try {
        const wasAtBottom = isAtBottomRef.current === true;
        onBeforePrepend();
        if (!wasAtBottom) preserveAnchorOnce();
        suppressFollowFor(600);
        const res = await fetchOlder();
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            onAfterPrepend();
            resolve();
          });
        });
        if (tryFindAndScroll()) return;
        if (!res || (res as any).added === 0) {
          await new Promise((r) => setTimeout(r, 50));
          if (tryFindAndScroll()) return;
        }
      } catch {
        break; // avoid infinite loops on errors
      }
    }
    // Not found → silent no-op (optionally toast)
  });

  // ————————————————————————————————————————————————————————————————
  // List events

  const loadOlderWithAnchor = useStableCallback(() => {
    if (loadingOlder || reachedHistoryStart) return;
    const wasAtBottom = isAtBottomRef.current === true;

    onBeforePrepend();
    if (!wasAtBottom) {
      try {
        preserveAnchorOnce();
      } catch {}
    }
    try {
      suppressFollowFor(300);
    } catch {}
    if (!wasAtBottom) setAtBottom(false);

    void (async () => {
      try {
        await fetchOlder();
      } finally {
        requestAnimationFrame(() => onAfterPrepend());
      }
    })();
  });

  const onStartReached = useStableCallback(loadOlderWithAnchor);

  const onAtBottomStateChange = useStableCallback((atBottom: boolean) => {
    setAtBottom(atBottom);
    setIsAtBottom(atBottom);
    if (atBottom && newAnchorId != null) setNewAnchorId(null);
  });

  // ————————————————————————————————————————————————————————————————
  // Composer (stable + resilient optimistic flow)

  const sendText = useStableCallback((text: string) => {
    if (!text) return;
    const tempId = -Date.now() - Math.floor(Math.random() * 1000);
    const nowIso = new Date().toISOString();
    const idempotencyKey = `msg:${bookingRequestId}:${Math.abs(tempId)}`;
    const clientRequestId = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
      ? (crypto as any).randomUUID()
      : `cid:${Date.now()}:${Math.floor(Math.random() * 1e6)}`;

    setMessages((prev: any[]) => [
      ...prev,
      {
        id: tempId,
        booking_request_id: bookingRequestId,
        sender_id: myUserId,
        sender_type: userType,
        content: text,
        message_type: 'USER',
        timestamp: nowIso,
        status: transport.online ? 'sending' : 'queued',
        reply_to_message_id: replyTarget?.id ?? null,
        reply_to_preview: replyTarget?.content ?? null,
      },
    ]);

    try {
      setAtBottom(true);
      scheduleScrollToEndSmooth();
    } catch {}

    // Fallback: if echo is slightly delayed, flip temp to 'sent' after a short grace
    let flipTimer: any = null;
    try {
      flipTimer = setTimeout(() => {
        setMessages((prev: any[]) => prev.map((m: any) => (
          Number(m?.id) === tempId && String(m?.status || '').toLowerCase() === 'sending'
            ? { ...m, status: 'sent' }
            : m
        )));
      }, 180);
    } catch {}

    void (handlers as any).sendWithQueue(
      tempId,
      async () => (handlers as any).send({ content: text, reply_to_message_id: replyTarget?.id }, { idempotencyKey, clientRequestId }),
      (real: any) => {
        try { if (flipTimer) clearTimeout(flipTimer); } catch {}
        setMessages((prev: any[]) => {
          const withoutTemp = prev.filter((m: any) => m.id !== tempId);
          const already = withoutTemp.some((m: any) => m.id === real.id);
          return already ? withoutTemp : [...withoutTemp, { ...real, status: 'sent' }];
        });
        try { setReplyTarget(null); } catch {}
      },
      () => {},
      { kind: 'text', clientRequestId },
    );
  });

  // Track created blob URLs to revoke later if needed (avoid leaks on unmount)
  const createdBlobUrlsRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    return () => {
      // Revoke any leftover previews when component unmounts / thread switches
      // Use Set#forEach to support ES5 targets without --downlevelIteration.
      createdBlobUrlsRef.current.forEach((url) => {
        try { URL.revokeObjectURL(url); } catch {}
      });
      createdBlobUrlsRef.current.clear();
    };
  }, [bookingRequestId]);

  const uploadFiles = useStableCallback(async (files: File[]) => {
    for (const file of files) {
      const tempId = -Date.now() - Math.floor(Math.random() * 1000);
      const previewUrl = URL.createObjectURL(file);
      createdBlobUrlsRef.current.add(previewUrl);

      const nowIso = new Date().toISOString();
      const idempotencyKey = `file:${bookingRequestId}:${Math.abs(tempId)}`;

      // Optimistic bubble
      setMessages((prev: any[]) => [
        ...prev,
        {
          id: tempId,
          booking_request_id: bookingRequestId,
          sender_id: myUserId,
          sender_type: userType,
          content: file.name,
          message_type: 'USER',
          attachment_url: previewUrl,
          attachment_meta: { content_type: file.type, size: file.size, original_filename: file.name },
          timestamp: nowIso,
          status: transport.online ? 'sending' : 'queued',
          _upload_pct: 1,
        },
      ]);

      try {
        setAtBottom(true);
        scheduleScrollToEndSmooth();
      } catch {}

      try {
        // 1) Create server placeholder and get presign
        const kind = file.type.startsWith('audio/') ? 'voice' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : 'file';
        const initRes = await initAttachmentMessage(bookingRequestId, { kind, filename: file.name, content_type: file.type, size: file.size });
        const serverMsg = (initRes.data as any)?.message;
        const presign = (initRes.data as any)?.presign || {};
        const mid = Number(serverMsg?.id || 0);
        if (Number.isFinite(mid) && mid > 0) {
          setMessages((prev: any[]) => prev.map((m: any) => (m.id === tempId ? { ...m, id: mid, content: String(serverMsg?.content || file.name), status: transport.online ? 'sending' : 'queued' } : m)));
        }
        // 2) Upload to presigned URL (fallback to legacy helper if not available)
        let finalUrl: string | null = null;
        if (presign && presign.put_url) {
          const headers = presign.headers && Object.keys(presign.headers).length ? presign.headers : (file.type ? { 'Content-Type': file.type } : {});
          await axios.put(presign.put_url as string, file, {
            headers,
            withCredentials: false,
            onUploadProgress: (evt) => {
              if (evt.total) {
                const pct = Math.round((evt.loaded * 100) / evt.total);
                setMessages((prev: any[]) => prev.map((m: any) => (Number(m?.id) === (mid || tempId) ? { ...m, _upload_pct: pct } : m)));
              }
            },
          });
          finalUrl = String(presign.public_url || presign.get_url || '');
        } else {
          const uploaded = await (handlers as any)?.upload?.(file, (pct: number) => {
            setMessages((prev: any[]) => prev.map((m: any) => (m.id === (mid || tempId) ? { ...m, _upload_pct: pct } : m)));
          });
          finalUrl = String(uploaded?.url || '');
        }
        // Save URL for retry if needed
        if (finalUrl) {
          const messageKeyId = Number.isFinite(mid) && mid > 0 ? mid : tempId;
          setMessages((prev: any[]) => prev.map((m: any) => (Number(m?.id) === messageKeyId ? { ...m, _r2_url: finalUrl } : m)));
        }
        // 3) Finalize via queued runner
        const messageKeyId = Number.isFinite(mid) && mid > 0 ? mid : tempId;
        const meta = { original_filename: file.name || null, content_type: file.type || null, size: Number.isFinite(file.size) ? file.size : null } as any;
        void (handlers as any).sendWithQueue(
          messageKeyId,
          async () => {
            if (!finalUrl) throw new Error('No upload URL available to finalize');
            const fin = await finalizeAttachmentMessage(bookingRequestId, Number(mid) || Number(messageKeyId), finalUrl!, meta);
            return fin.data as any;
          },
          (real: any) => {
            setMessages((prev: any[]) => prev.map((m: any) => (Number(m?.id) === (mid || messageKeyId) ? { ...real, status: 'sent' } : m)));
            try { URL.revokeObjectURL(previewUrl); createdBlobUrlsRef.current.delete(previewUrl); } catch {}
          },
          () => {
            setMessages((prev: any[]) => prev.map((m: any) => (Number(m?.id) === (mid || messageKeyId) ? { ...m, status: 'failed', _upload_pct: undefined } : m)));
          },
          { kind: (file.type && file.type.startsWith('audio/')) ? 'voice' : 'file' },
        );
      } catch (err) {
        // Fallback to legacy one-shot upload+send
        const execLegacy = async () => {
          const uploaded = await (handlers as any)?.upload?.(file, (pct: number) => {
            setMessages((prev: any[]) => prev.map((m: any) => (m.id === tempId ? { ...m, _upload_pct: pct } : m)));
          });
          const real = await (handlers as any)?.send?.({ content: '', attachment_url: uploaded.url, attachment_meta: uploaded.metadata }, { idempotencyKey });
          return real;
        };
        void (handlers as any).sendWithQueue(
          tempId,
          execLegacy,
          (real: any) => {
            setMessages((prev: any[]) => {
              const withoutTemp = prev.filter((m: any) => m.id !== tempId);
              const already = withoutTemp.some((m: any) => m.id === real.id);
              return already ? withoutTemp : [...withoutTemp, { ...real, status: 'sent' }];
            });
            try { URL.revokeObjectURL(previewUrl); createdBlobUrlsRef.current.delete(previewUrl); } catch {}
          },
          () => {
            setMessages((prev: any[]) => prev.map((m: any) => (m.id === tempId ? { ...m, status: 'failed', _upload_pct: undefined } : m)));
          },
          { kind: (file.type && file.type.startsWith('audio/')) ? 'voice' : 'file' },
        );
      }
    }
  });

  // ——— Typing (throttled to 1 event / 1.2s for hygiene)
  const throttledTyping = useThrottled(() => {
    try {
      const topic = `booking-requests:${bookingRequestId}`;
      publish(topic, { type: 'typing', user_id: myUserId });
    } catch {}
  }, 1200);

  // ————————————————————————————————————————————————————————————————
  // Composer resize → adjust anchoring minimally
  React.useEffect(() => {
    const el = composerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let prev = el.getBoundingClientRect().height || 0;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const next = entry.contentRect.height;
      const delta = next - prev;
      if (Math.abs(delta) > 0.5) applyComposerDelta(delta);
      prev = next;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [applyComposerDelta]);

  // ————————————————————————————————————————————————————————————————
  // Item renderer (stable)
  const renderGroupAtIndex = useStableCallback((index: number) => {
    const group = (groups as any)[index];
    if (!group) return null;
    return (
      <GroupRenderer
        group={group as any}
        myUserId={myUserId}
        bookingRequestId={bookingRequestId}
        userType={userType}
        clientName={clientName}
        clientAvatarUrl={clientAvatarUrl}
        artistName={artistName}
        artistAvatarUrl={artistAvatarUrl}
        highlightId={highlightId}
        quotesById={quotesById}
        ensureQuoteLoaded={ensureQuoteLoaded}
        onOpenDetailsPanel={onOpenDetailsPanel}
        onOpenQuote={onOpenQuote}
        onRequestNewQuote={requestNewQuote}
        disableRequestNewQuote={disableRequestNewQuote}
        isPaid={isPaid}
        galleryItems={galleryItems}
        resolveReplyPreview={resolveReplyPreview}
        onJumpToMessage={jumpToMessage}
        onRetryMessage={(id) => {
          const mid = Number(id);
          if (!Number.isFinite(mid) || mid <= 0) return;
          const list = messagesRef.current as any[] | undefined;
          const msg = Array.isArray(list) ? list.find((m: any) => Number(m?.id) === mid) : null;
          if (!msg) return;

          const content = String(msg?.content || '');
          const rid = Number(msg?.reply_to_message_id || 0);
          const attUrl = String(msg?.attachment_url || '');
          const attMeta = msg?.attachment_meta && typeof msg.attachment_meta === 'object' ? msg.attachment_meta : null;
          const isBlob = attUrl.startsWith('blob:') || attUrl.startsWith('data:');

          const finalizeUrl = (msg as any)?._r2_url ? String((msg as any)._r2_url) : '';
          if (finalizeUrl) {
            void (handlers as any).sendWithQueue(
              mid,
              async () => {
                const fin = await finalizeAttachmentMessage(bookingRequestId, mid, finalizeUrl, attMeta || undefined);
                return fin.data as any;
              },
              (real: any) => {
                setMessages((prev: any[]) => prev.map((m: any) => (Number(m?.id) === mid ? { ...real, status: 'sent' } : m)));
              },
              () => {
                setMessages((prev: any[]) => prev.map((m: any) => (Number(m?.id) === mid ? { ...m, status: 'failed' } : m)));
              },
              { kind: 'file' },
            );
            return;
          }

          const payload: any = { content };
          if (Number.isFinite(rid) && rid > 0) payload.reply_to_message_id = rid;
          if (attUrl && !isBlob) {
            payload.attachment_url = attUrl;
            if (attMeta) payload.attachment_meta = attMeta;
          }

          // Retry via queued runner (queues when offline, sends immediately when online)
          void (handlers as any).sendWithQueue(
            mid,
            async () => (handlers as any)?.send?.(payload),
            (real: any) => {
              setMessages((prev: any[]) => prev.map((m: any) => (Number(m?.id) === mid ? { ...real, status: 'sent' } : m)));
            },
            () => {
              setMessages((prev: any[]) => prev.map((m: any) => (Number(m?.id) === mid ? { ...m, status: 'failed' } : m)));
            },
            { kind: attUrl ? ((attMeta && typeof attMeta === 'object' && typeof (attMeta as any).content_type === 'string' && (attMeta as any).content_type.startsWith('audio/')) ? 'voice' : 'file') : 'text' },
          );
        }}
        onMediaLoad={() => {
          try {
            listRef.current?.refreshMeasurements();
          } catch {}
          try {
            suppressFollowFor(200);
          } catch {}
        }}
        onToggleReaction={(id, emoji, hasNow) => {
          try {
            const now = Date.now();
            const last = lastReactionToggleRef.current[id] || 0;
            if (now - last < 300) return;
            lastReactionToggleRef.current[id] = now;
            (handlers as any)?.reactToggle?.(id, emoji, hasNow);
          } catch {}
        }}
        onReplyToMessage={(target) => {
          try {
            const snippet = (target?.content || '').toString().slice(0, 140);
            setReplyTarget({ id: Number(target.id), sender_type: (target?.sender_type || '') as any, content: snippet });
            try {
              composerRef.current?.querySelector('textarea')?.focus();
            } catch {}
          } catch {}
        }}
        onDeleteMessage={(id) => {
          void (async () => {
            const mid = Number(id);
            if (!Number.isFinite(mid) || mid <= 0) return;
            let snapshot: any[] | null = null;
            setMessages((prev: any[]) => {
              snapshot = prev;
              return prev.map((m: any) =>
                Number(m?.id) === mid
                  ? { ...m, _deleted: true, content: '', attachment_url: null, attachment_meta: null, reactions: {}, my_reactions: [] }
                  : m,
              );
            });
            try {
              await (handlers as any)?.deleteMessage?.(mid);
            } catch {
              if (snapshot) setMessages(snapshot);
            }
          })();
        }}
        newMessageAnchorId={newAnchorId}
        onPayNow={onPayNow}
        onDecline={onDecline}
      />
    );
  });

  // Stable computeItemKey to avoid re-renders under virtualization
  const computeItemKey = useStableCallback((index: number) => {
    try {
      const group: any = (groups as any)[index];
      const first = group?.messages?.[0];
      const keyParts = [first?.id ?? index, first?.timestamp ?? '', first?.sender_id ?? ''];
      return keyParts.join(':');
    } catch {
      return String(index);
    }
  });

  // ————————————————————————————————————————————————————————————————
  // Render

  const hasQueued = React.useMemo(() => {
    try {
      const list = Array.isArray(messages) ? messages : [];
      return list.some((m: any) => String(m?.status || '').toLowerCase() === 'queued');
    } catch { return false; }
  }, [messages]);

  // Compute accepted quote and booking id (for Event Prep)
  const acceptedQuoteIdFromProps = React.useMemo(() => {
    try {
      const id = Number((initialBookingRequest as any)?.accepted_quote_id || 0);
      return Number.isFinite(id) && id > 0 ? id : 0;
    } catch { return 0; }
  }, [initialBookingRequest]);

  React.useEffect(() => {
    if (acceptedQuoteIdFromProps > 0) {
      try { void ensureQuoteLoaded?.(acceptedQuoteIdFromProps); } catch {}
    }
  }, [acceptedQuoteIdFromProps, ensureQuoteLoaded]);

  const acceptedQuoteForThread = React.useMemo(() => {
    try {
      if (acceptedQuoteIdFromProps > 0) {
        const q = quotesById?.[acceptedQuoteIdFromProps];
        if (q && Number(q?.id) === acceptedQuoteIdFromProps) return q;
      }
      // Fallback: scan for any accepted quote tied to this thread
      const values = Object.values((quotesById || {})) as any[];
      const found = values.find(
        (q: any) => Number(q?.booking_request_id) === Number(bookingRequestId) && String(q?.status || '').toLowerCase() === 'accepted',
      );
      return found || null;
    } catch { return null; }
  }, [quotesById, acceptedQuoteIdFromProps, bookingRequestId]);

  // If we found an accepted quote but it lacks booking_id (e.g., legacy shape),
  // fetch the canonical v2 quote to hydrate booking_id for Event Prep.
  React.useEffect(() => {
    try {
      const q: any = acceptedQuoteForThread;
      const qid = Number(q?.id || 0);
      const hasBookingId = Number.isFinite(Number(q?.booking_id || 0)) && Number(q?.booking_id) > 0;
      if (qid > 0 && !hasBookingId) {
        void ensureQuoteLoaded?.(qid);
      }
    } catch {}
  }, [acceptedQuoteForThread, ensureQuoteLoaded]);

  const bookingIdForPrep = React.useMemo(() => {
    try {
      const bid = Number((acceptedQuoteForThread as any)?.booking_id || 0);
      if (Number.isFinite(bid) && bid > 0) return bid;
      // Fallback to cached booking id if present
      try {
        const cached = sessionStorage.getItem(`bookingId:br:${bookingRequestId}`);
        const cachedBid = cached ? Number(cached) : 0;
        if (Number.isFinite(cachedBid) && cachedBid > 0) return cachedBid;
      } catch {}
      return 0;
    } catch { return 0; }
  }, [acceptedQuoteForThread, bookingRequestId]);

  const enableEventPrepCard = (process.env.NEXT_PUBLIC_ENABLE_EVENT_PREP_CARD || '1') !== '0';
  const paid = Boolean(isPaidOverride) || isPaidFromMessages;
  const showEventPrepCard = enableEventPrepCard && paid;

  return (
    <ThreadView
      list={
        <ListComponent
          ref={listRef}
          data={groups as any}
          alignToBottom
          computeItemKey={computeItemKey}
          itemContent={(index: number) => <div className="w-full">{renderGroupAtIndex(index)}</div>}
          renderHeader={() => {
            // Show an inline spinner during first load when no messages are present yet
            const empty = !Array.isArray(messages) || messages.length === 0;
            if (!loading || !empty) return null;
            return (
              <div className="flex justify-center items-center py-2" aria-label="Loading messages" role="status" aria-live="polite">
                <Spinner size="sm" />
              </div>
            );
          }}
          // keep handlers stable to avoid Virtuoso churn
          followOutput={followOutput}
          style={{ height: '100%', width: '100%' }}
          startReached={onStartReached}
          atBottomStateChange={onAtBottomStateChange}
        />
      }
      composer={
        <div ref={composerRef}>
          {showEventPrepCard && (
            <div className="px-2 pt-2" aria-label="Event preparation">
              <EventPrepCard
                bookingId={bookingIdForPrep > 0 ? bookingIdForPrep : 0}
                bookingRequestId={bookingRequestId}
                canEdit={true}
                summaryOnly
                onContinuePrep={() => {
                  if (bookingIdForPrep > 0) {
                    try { window.location.href = `/dashboard/events/${bookingIdForPrep}`; } catch {}
                    return;
                  }
                  try { onContinueEventPrep?.(bookingRequestId); } catch {}
                }}
              />
            </div>
          )}
          {(!transport.online && hasQueued) && (
            <div className="px-2 pt-1" aria-live="polite" role="status">
              <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-2 py-1 text-[12px] shadow-sm">
                Will send when back online
              </div>
            </div>
          )}
          {replyTarget && (
            <div className="px-2 pt-1">
              <div
                className="rounded-xl border border-gray-200 bg-white shadow-sm px-2 py-1 flex items-center justify-between gap-2"
                aria-live="polite"
              >
                <div className="min-w-0 text-[12px] whitespace-nowrap overflow-hidden text-ellipsis">
                  <span className="font-semibold">
                    Replying to {replyTarget.sender_type === 'client' ? 'Client' : 'You'}:{' '}
                  </span>
                  <span className="italic text-gray-700">{replyTarget.content}</span>
                </div>
                <button
                  type="button"
                  aria-label="Cancel reply"
                  className="w-7 h-7 rounded-full grid place-items-center hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                  onClick={() => setReplyTarget(null)}
                >
                  <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden>
                    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          <Composer
            disabled={false}
            onSend={sendText}
            onUploadFiles={uploadFiles}
            onTyping={throttledTyping}
          />
        </div>
      }
    />
  );
}
