// frontend/src/components/booking/MessageThread.tsx
'use client';

import React, {
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { format, isValid, differenceInCalendarDays, startOfDay } from 'date-fns';
import data from '@emoji-mart/data';
import { DocumentIcon, DocumentTextIcon, FaceSmileIcon } from '@heroicons/react/24/outline';
import { ClockIcon, ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

import {
  getFullImageUrl,
} from '@/lib/utils';
import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';
import { parseBookingDetailsFromMessage } from '@/lib/bookingDetails';

import {
  Booking,
  BookingSimple,
  Review,
  // DO NOT import Message — we use a thread-safe internal type here
  MessageCreate,
  QuoteV2,
  QuoteV2Create,
  BookingRequest,
} from '@/types';

import {
  getMessagesForBookingRequest,
  postMessageToBookingRequest,
  uploadMessageAttachment,
  createQuoteV2,
  getQuoteV2,
  acceptQuoteV2,
  declineQuoteV2,
  getBookingDetails,
  getBookingRequestById,
  markMessagesRead,
  markThreadRead,
  updateBookingRequestArtist,
  useAuth,
} from '@/lib/api';

import useOfflineQueue from '@/hooks/useOfflineQueue';
import usePaymentModal from '@/hooks/usePaymentModal';
import useWebSocket from '@/hooks/useWebSocket';
import useBookingView from '@/hooks/useBookingView';

import Button from '../ui/Button';
import QuoteBubble from './QuoteBubble';
import QuoteDrawer from './QuoteDrawer';
import InlineQuoteForm from './InlineQuoteForm';
import BookingSummaryCard from './BookingSummaryCard';
import { t } from '@/lib/i18n';

const EmojiPicker = dynamic(() => import('@emoji-mart/react'), { ssr: false });
const MemoQuoteBubble = React.memo(QuoteBubble);
const MemoInlineQuoteForm = React.memo(InlineQuoteForm);

// ===== Constants ==============================================================
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_BASE = API_BASE.replace(/^http/, 'ws');
const API_V1 = '/api/v1';
const TEN_MINUTES_MS = 10 * 60 * 1000;
const MIN_SCROLL_OFFSET = 20;
const MAX_TEXTAREA_LINES = 10;
const isImageAttachment = (url?: string | null) =>
  !!url && /\.(jpe?g|png|gif|webp)$/i.test(url);

const gmt2ISOString = () =>
  new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().replace('Z', '+02:00');

const normalizeType = (v?: string | null) => (v ?? '').toUpperCase();
const daySeparatorLabel = (date: Date) => {
  const now = new Date();
  const days = differenceInCalendarDays(startOfDay(now), startOfDay(date));
  if (days === 0) return format(date, 'EEEE');
  if (days === 1) return 'yesterday';
  if (days < 7) return format(date, 'EEEE');
  return format(date, 'EEE, d LLL');
};

// ===== Internal thread message shape =========================================
// Keeps the UI happy even if backend or global types lag during the migration.
type SenderTypeAny = 'client' | 'artist' | 'service_provider';
type VisibleToAny = 'artist' | 'service_provider' | 'client' | 'both';
type MessageStatus = 'queued' | 'sending' | 'sent' | 'failed';
type MessageKind = 'text' | 'quote' | 'system' | 'USER' | 'QUOTE' | 'SYSTEM';

type ThreadMessage = {
  is_read: boolean;
  id: number;
  booking_request_id: number;
  sender_id: number;
  sender_type: 'client' | 'service_provider'; // normalized
  content: string;
  message_type: MessageKind;
  quote_id?: number | null;
  attachment_url?: string | null;
  visible_to?: 'client' | 'service_provider' | 'both'; // normalized
  action?: string | null;
  avatar_url?: string | null;
  expires_at?: string | null;
  unread?: boolean;
  timestamp: string;
  status?: MessageStatus;
};

// Normalize mixed legacy/new fields into ThreadMessage
function normalizeSenderType(raw: SenderTypeAny | string | null | undefined): 'client' | 'service_provider' {
  if (raw === 'client') return 'client';
  // Treat legacy 'artist' as 'service_provider'
  return 'service_provider';
}
function normalizeVisibleTo(raw: VisibleToAny | string | null | undefined): 'client' | 'service_provider' | 'both' {
  if (!raw) return 'both';
  if (raw === 'both' || raw === 'client' || raw === 'service_provider') return raw;
  // Legacy 'artist' -> 'service_provider'
  return 'service_provider';
}
function normalizeMessage(raw: any): ThreadMessage {
  return {
    id: Number(raw.id),
    booking_request_id: Number(raw.booking_request_id),
    sender_id: Number(raw.sender_id),
    sender_type: normalizeSenderType(raw.sender_type),
    content: String(raw.content ?? ''),
    message_type: (raw.message_type ?? 'text') as MessageKind,
    quote_id: raw.quote_id == null ? null : Number(raw.quote_id),
    attachment_url: raw.attachment_url ?? null,
    visible_to: normalizeVisibleTo(raw.visible_to),
    action: raw.action ?? null,
    avatar_url: raw.avatar_url ?? null,
    expires_at: raw.expires_at ?? null,
    unread: Boolean(raw.unread),
    is_read: Boolean(raw.is_read),
    timestamp: raw.timestamp ?? new Date().toISOString(),
    status: raw.status as MessageStatus | undefined,
  };
}

// Merge-by-id helper; stable chronological sort; prefers newer timestamp
function mergeMessages(existing: ThreadMessage[], incoming: ThreadMessage | ThreadMessage[]): ThreadMessage[] {
  const list = Array.isArray(incoming) ? incoming : [incoming];

  const map = new Map<number, ThreadMessage>();
  for (const m of existing) map.set(m.id, m);

  for (const m of list) {
    const prev = map.get(m.id);
    if (!prev) {
      map.set(m.id, m);
      continue;
    }
    const prevTs = new Date(prev.timestamp).getTime();
    const curTs = new Date(m.timestamp).getTime();
    map.set(m.id, curTs >= prevTs ? { ...prev, ...m } : { ...m, ...prev });
  }

  return [...map.values()].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

// ===== Public API =============================================================
export interface MessageThreadHandle {
  refreshMessages: () => void;
}

interface ParsedBookingDetails {
  eventType?: string;
  description?: string;
  date?: string;
  location?: string;
  guests?: string;
  venueType?: string;
  soundNeeded?: string;
  notes?: string;
}

interface MessageThreadProps {
  bookingRequestId: number;
  onMessageSent?: () => void;
  onQuoteSent?: () => void;
  serviceId?: number;
  artistName?: string;
  clientName?: string;
  clientId?: number;
  artistId?: number;
  artistAvatarUrl?: string | null;
  clientAvatarUrl?: string | null;
  isSystemTyping?: boolean;
  serviceName?: string;
  initialNotes?: string | null;
  onBookingDetailsParsed?: (details: ParsedBookingDetails) => void;
  initialBaseFee?: number;
  initialTravelCost?: number;
  initialSoundNeeded?: boolean;
  onBookingConfirmedChange?: (isConfirmed: boolean, booking: Booking | null) => void;
  onPaymentStatusChange?: (
    status: string | null,
    amount: number | null,
    receiptUrl: string | null
  ) => void;
  onShowReviewModal?: (show: boolean) => void;
  onOpenDetailsPanel?: () => void;
  artistCancellationPolicy?: string | null;
  allowInstantBooking?: boolean;
  instantBookingPrice?: number;
  isDetailsPanelOpen?: boolean;
}

// SVG
const DoubleCheckmarkIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M12.75 12.75L15 15 18.75 9.75" />
  </svg>
);

// ===== Component ==============================================================
const MessageThread = forwardRef<MessageThreadHandle, MessageThreadProps>(function MessageThread(
  {
    bookingRequestId,
    onMessageSent,
    onQuoteSent,
    serviceId,
    artistName = 'Service Provider',
    clientName = 'Client',
    clientAvatarUrl = null,
    clientId: propClientId,
    artistId: propArtistId,
    artistAvatarUrl = null,
    isSystemTyping = false,
    serviceName,
    initialNotes = null,
    onBookingDetailsParsed,
    initialBaseFee,
    initialTravelCost,
    initialSoundNeeded,
    onBookingConfirmedChange,
    onPaymentStatusChange,
    onShowReviewModal,
    onOpenDetailsPanel,
    artistCancellationPolicy,
    allowInstantBooking,
    instantBookingPrice,
    isDetailsPanelOpen = false,
  }: MessageThreadProps,
  ref,
) {
  const { user } = useAuth();
  const router = useRouter();

  // ---- State
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [quotes, setQuotes] = useState<Record<number, QuoteV2>>({});
  const [loading, setLoading] = useState(true);
  const [newMessageContent, setNewMessageContent] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [bookingDetails, setBookingDetails] = useState<Booking | null>(null);
  const [bookingRequest, setBookingRequest] = useState<BookingRequest | null>(null);
  const [parsedBookingDetails, setParsedBookingDetails] = useState<ParsedBookingDetails | undefined>();
  const [threadError, setThreadError] = useState<string | null>(null);
  const [wsFailed, setWsFailed] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [uploadingProgress, setUploadingProgress] = useState(0);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [textareaLineHeight, setTextareaLineHeight] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDetailsCard, setShowDetailsCard] = useState(false);
  const [isPortalReady, setIsPortalReady] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState<{ status: string | null; amount: number | null; receiptUrl: string | null }>({ status: null, amount: null, receiptUrl: null });
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [quoteDrawerOpen, setQuoteDrawerOpen] = useState(false);
  const [quoteDrawerId, setQuoteDrawerId] = useState<number | null>(null);
  const [quoteDrawerTopOffset, setQuoteDrawerTopOffset] = useState<number>(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // ---- Offline queue
  const { enqueue: enqueueMessage } = useOfflineQueue<{
    tempId: number;
    payload: MessageCreate;
  }>('offlineSendQueue', async ({ tempId, payload }) => {
    const res = await postMessageToBookingRequest(bookingRequestId, payload);
    setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...normalizeMessage(res.data), status: 'sent' } : m)));
  });

  // ---- Refs
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const prevMessageCountRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const firstUnreadMessageRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadedRef = useRef(false); // gate WS until first REST load
  const touchStartYRef = useRef(0);
  const stabilizingRef = useRef(true);
  const stabilizeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fetchInFlightRef = useRef(false);

  // ---- Presence
  const [typingUsers, setTypingUsers] = useState<number[]>([]);

  // ---- Derived
  const computedServiceName = serviceName ?? bookingDetails?.service?.title;
  const currentClientId =
    propClientId ||
    bookingDetails?.client_id ||
    messages.find((m) => m.sender_type === 'client')?.sender_id ||
    0;
  const currentArtistId = propArtistId || bookingDetails?.artist_id || user?.id || 0;

  const [baseFee, setBaseFee] = useState(initialBaseFee ?? 0);
  const [travelFee, setTravelFee] = useState(initialTravelCost ?? 0);
  const [initialSound, setInitialSound] = useState<boolean | undefined>(initialSoundNeeded);
  const [initialSoundCost, setInitialSoundCost] = useState<number | undefined>(undefined);
  const [calculationParams, setCalculationParams] = useState<
    | {
        base_fee: number;
        distance_km: number;
        service_id: number;
        event_city: string;
        accommodation_cost?: number;
      }
    | undefined
  >(undefined);

  const eventDetails = useMemo(() => {
    // Prefer parsed date; otherwise fall back to proposed date from the booking request/booking
    const rawDate = parsedBookingDetails?.date
      ?? (bookingRequest as any)?.proposed_datetime_1
      ?? (bookingRequest as any)?.proposed_datetime_2
      ?? (bookingDetails as any)?.start_time
      ?? undefined;
    let dateLabel: string | undefined = undefined;
    if (rawDate) {
      const d = new Date(rawDate);
      dateLabel = isValid(d) ? format(d, 'PPP') : String(rawDate);
    }

    // Location name/address fallbacks
    const tb: any = (bookingRequest as any)?.travel_breakdown || {};
    const locName = (parsedBookingDetails as any)?.location_name
      || tb.venue_name
      || tb.place_name
      || tb.location_name
      || undefined;
    const locAddr = (parsedBookingDetails as any)?.location
      || tb.address
      || tb.event_city
      || tb.event_town
      || (bookingRequest as any)?.service?.service_provider?.location
      || undefined;

    return {
      from: clientName || 'Client',
      receivedAt: format(new Date(), 'PPP'),
      event: (parsedBookingDetails as any)?.eventType || (parsedBookingDetails as any)?.event_type,
      date: dateLabel,
      guests: (parsedBookingDetails as any)?.guests,
      venue: (parsedBookingDetails as any)?.venueType,
      notes: (parsedBookingDetails as any)?.notes,
      locationName: locName,
      locationAddress: locAddr,
    } as any;
  }, [clientName, parsedBookingDetails, bookingRequest, bookingDetails]);

  // ---- Payment modal
  const { openPaymentModal, paymentModal } = usePaymentModal(
    useCallback(({ status, amount, receiptUrl: url }) => {
      setPaymentInfo({ status: status ?? null, amount: amount ?? null, receiptUrl: url ?? null });
      if (status === 'paid') {
        setBookingConfirmed(true);
        onBookingConfirmedChange?.(true, bookingDetails);
        // Add a reassuring system message on payment
        const paidMsg: ThreadMessage = {
          id: -Date.now() - 1,
          booking_request_id: bookingRequestId,
          sender_id: user?.id || 0,
          sender_type: user?.user_type === 'service_provider' ? 'service_provider' : 'client',
          content: 'Payment received. Your booking is confirmed and the date is secured. A receipt is available in your booking details.',
          message_type: 'SYSTEM',
          quote_id: null,
          attachment_url: null,
          visible_to: 'both',
          action: null,
          avatar_url: undefined,
          expires_at: null,
          unread: false,
          is_read: true,
          timestamp: new Date().toISOString(),
          status: 'sent',
        };
        setMessages((prev) => mergeMessages(prev, paidMsg));
        // Also persist a backend message so the other party receives a header notification
        (async () => {
          try {
            const text = url
              ? 'Payment received. Your booking is confirmed and the date is secured. View your receipt from booking details.'
              : 'Payment received. Your booking is confirmed and the date is secured.';
            await postMessageToBookingRequest(bookingRequestId, { content: text });
            // Nudge header unread counts to refresh
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new Event('threads:updated'));
            }
          } catch (e) {
            // non-fatal
          }
        })();
      }
      setIsPaymentOpen(false);
      onPaymentStatusChange?.(status, amount, url ?? null);
    }, [onPaymentStatusChange, bookingDetails, onBookingConfirmedChange]),
    useCallback(() => { setIsPaymentOpen(false); }, []),
  );

  const { isClientView: isClientViewFlag, isProviderView: isProviderViewFlag, isPaid: isPaidFlag } = useBookingView(user, bookingDetails, paymentInfo, bookingConfirmed);

  // ---- Focus textarea on mount & thread switch
  useEffect(() => { textareaRef.current?.focus(); }, []);
  useEffect(() => { textareaRef.current?.focus(); }, [bookingRequestId]);

  // ---- Portal ready
  useEffect(() => { setIsPortalReady(true); }, []);

  // ---- Compute drawer top offset so it doesn't overlap the site header on web
  useEffect(() => {
    const compute = () => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      const top = rect ? Math.max(0, Math.round(rect.top)) : 0;
      setQuoteDrawerTopOffset(top);
    };
    compute();
    const handle = () => compute();
    window.addEventListener('scroll', handle, { passive: true });
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle as any);
      window.removeEventListener('resize', handle as any);
    };
  }, []);

  // ---- Prefill quote form (SP side)
  const hasSentQuote = useMemo(() => messages.some((m) => Number(m.quote_id) > 0), [messages]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await getBookingRequestById(bookingRequestId);
        if (cancelled) return;
        const br = res.data;
        setBookingRequest(br);
        setBookingRequest(br);
        const tb = (br.travel_breakdown || {}) as any;
        const svcPrice = Number(br.service?.price) || 0;
        setBaseFee(svcPrice);
        setTravelFee(Number(br.travel_cost) || 0);
        if (typeof initialSound === 'undefined') {
          setInitialSound(Boolean(tb.sound_required));
        }
        const soundProv = (br.service?.details || {}).sound_provisioning;
        if (tb.sound_required && soundProv?.mode === 'artist_provides_variable') {
          const drive = Number(soundProv.price_driving_sound_zar || soundProv.price_driving_sound || 0);
          const fly = Number(soundProv.price_flying_sound_zar || soundProv.price_flying_sound || 0);
          const mode = tb.travel_mode || tb.mode;
          setInitialSoundCost(mode === 'fly' ? fly : drive);
        } else if (tb.sound_required && tb.sound_cost) {
          setInitialSoundCost(Number(tb.sound_cost));
        } else {
          setInitialSoundCost(undefined);
        }
        const distance = Number(tb.distance_km ?? tb.distanceKm);
        const eventCity = tb.event_city || parsedBookingDetails?.location || '';
        const svcId = br.service_id || serviceId || 0;
        if (distance && eventCity && svcId && tb.sound_required) {
          const params: {
            base_fee: number;
            distance_km: number;
            service_id: number;
            event_city: string;
            accommodation_cost?: number;
          } = {
            base_fee: svcPrice,
            distance_km: distance,
            service_id: svcId,
            event_city: eventCity,
          };
          if (tb.accommodation_cost) params.accommodation_cost = Number(tb.accommodation_cost);
          setCalculationParams(params);
        } else {
          setCalculationParams(undefined);
        }
      } catch (err) {
        console.error('Failed to load quote calculation params:', err);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [
    bookingRequestId,
    serviceId,
    user?.user_type,
    bookingConfirmed,
    hasSentQuote,
    parsedBookingDetails,
    initialSound,
  ]);

  // ---- Typing indicator label
  const typingIndicator = useMemo(() => {
    const names = typingUsers.map((id) =>
      id === currentArtistId ? artistName : id === currentClientId ? clientName : 'Participant',
    );
    if (isSystemTyping) names.push('System');
    if (names.length === 0) return null;
    const verb = names.length > 1 ? 'are' : 'is';
    return `${names.join(' and ')} ${verb} typing...`;
  }, [typingUsers, isSystemTyping, currentArtistId, currentClientId, artistName, clientName]);

  // ---- Textarea metrics
  useEffect(() => {
    if (textareaRef.current && textareaLineHeight === 0) {
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.visibility = 'hidden';
      tempDiv.style.height = 'auto';
      tempDiv.style.width = '200px';
      const computedStyle = getComputedStyle(textareaRef.current);
      tempDiv.style.fontFamily = computedStyle.fontFamily;
      tempDiv.style.fontSize = computedStyle.fontSize;
      tempDiv.style.lineHeight = computedStyle.lineHeight;
      tempDiv.innerText = 'M';
      document.body.appendChild(tempDiv);
      setTextareaLineHeight(tempDiv.clientHeight);
      document.body.removeChild(tempDiv);
    }
  }, [textareaRef, textareaLineHeight]);

  const autoResizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    const container = messagesContainerRef.current;
    if (!ta || textareaLineHeight === 0) return;
    const prevH = ta.offsetHeight;
    ta.style.height = 'auto';

    const style = getComputedStyle(ta);
    const padT = parseFloat(style.paddingTop);
    const bdrT = parseFloat(style.borderTopWidth);
    const bdrB = parseFloat(style.borderBottomWidth);
    const maxH = textareaLineHeight * MAX_TEXTAREA_LINES + padT + bdrT + bdrB;
    const newH = Math.min(ta.scrollHeight, maxH);
    ta.style.height = `${newH}px`;

    if (container && newH !== prevH && !isUserScrolledUp) {
      container.scrollTop += (newH - prevH);
    }
  }, [textareaLineHeight, isUserScrolledUp]);
  useEffect(() => { autoResizeTextarea(); }, [newMessageContent, autoResizeTextarea]);

  // ---- Dismiss emoji picker if clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showEmojiPicker && emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  const firstUnreadIndex = useMemo(
    () => messages.findIndex((msg) => msg.sender_id !== user?.id && !msg.is_read),
    [messages, user?.id],
  );

  // ---- Quote hydration (used by REST & WS)
  const ensureQuoteLoaded = useCallback(
    async (quoteId: number) => {
      if (quotes[quoteId]) return;
      try {
        const res = await getQuoteV2(quoteId);
        setQuotes((prev) => ({ ...prev, [quoteId]: res.data }));

        if (res.data.status === 'accepted' && res.data.booking_id) {
          setBookingConfirmed(true);
          if (!bookingDetails || bookingDetails.id !== res.data.booking_id) {
            try {
              const detailsRes = await getBookingDetails(res.data.booking_id);
              setBookingDetails(detailsRes.data);
            } catch (err) {
              console.error('Failed to fetch booking details for accepted quote:', err);
            }
          }
        }
      } catch (err) {
        console.error(`Failed to fetch quote ${quoteId}:`, err);
      }
    },
    [quotes, bookingDetails],
  );

  // ---- Composer height for padding
  const [composerHeight, setComposerHeight] = useState(0);
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const update = () => setComposerHeight(el.offsetHeight || 0);
    update();
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => update());
      ro.observe(el);
    } catch {
      window.addEventListener('resize', update);
    }
    return () => {
      if (ro && el) ro.unobserve(el);
      window.removeEventListener('resize', update);
    };
  }, [composerRef]);

  // ---- Fetch messages (initial + refresh)
  const fetchMessages = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    if (!initialLoadedRef.current) setLoading(true);
    try {
      const res = await getMessagesForBookingRequest(bookingRequestId);

      let parsedDetails: ParsedBookingDetails | undefined;
      // Filter meta booking-details system msg out of the visible list,
      // but still parse it into booking details.
      const normalized = res.data
        .map((raw: any) => normalizeMessage(raw))
        .filter((msg: ThreadMessage) => {
          if (normalizeType(msg.message_type) === 'SYSTEM' && typeof msg.content === 'string' && msg.content.startsWith(BOOKING_DETAILS_PREFIX)) {
            parsedDetails = parseBookingDetailsFromMessage(msg.content);
            return false;
          }
          if (initialNotes && normalizeType(msg.message_type) === 'USER' && msg.content.trim() === initialNotes.trim()) {
            return false;
          }
          return true;
        });

      setParsedBookingDetails(parsedDetails);
      if (parsedDetails && onBookingDetailsParsed) onBookingDetailsParsed(parsedDetails);

      // Mark as read (best effort). Also update thread unread counts.
      try {
        const hasUnread = normalized.some((m) => m.sender_id !== user?.id && !m.is_read);
        if (hasUnread) {
          await markMessagesRead(bookingRequestId);
        }
        try { await markThreadRead(bookingRequestId); } catch {}
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('threads:updated'));
        }
      } catch (err) {
        console.error('Failed to mark messages read:', err);
      }

      // Ensure quotes referenced are hydrated
      for (const m of normalized) {
        const qid = Number(m.quote_id);
        const isQuote =
          qid > 0 &&
          (normalizeType(m.message_type) === 'QUOTE' ||
            (normalizeType(m.message_type) === 'SYSTEM' && m.action === 'review_quote'));
        if (isQuote) void ensureQuoteLoaded(qid);
      }

      setMessages((prev) => mergeMessages(prev.length ? prev : [], normalized));
      setThreadError(null);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
      setThreadError(`Failed to load messages. ${(err as Error).message || 'Please try again.'}`);
    } finally {
      setLoading(false);
      initialLoadedRef.current = true; // <— gate opens: WS can merge now
      // Stabilize: jump to bottom without smooth scrolling, then allow auto-scroll
      try {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTo({
            top: messagesContainerRef.current.scrollHeight,
            behavior: 'auto',
          });
        }
      } catch {}
      stabilizingRef.current = true;
      if (stabilizeTimerRef.current) clearTimeout(stabilizeTimerRef.current);
      stabilizeTimerRef.current = setTimeout(() => {
        stabilizingRef.current = false;
      }, 250);
      fetchInFlightRef.current = false;
    }
  }, [bookingRequestId, user?.id, initialNotes, onBookingDetailsParsed, ensureQuoteLoaded]);
  useImperativeHandle(ref, () => ({ refreshMessages: fetchMessages }), [fetchMessages]);
  useEffect(() => { fetchMessages(); }, [bookingRequestId, fetchMessages]);

  // ---- WS connection
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('token') || sessionStorage.getItem('token') || ''
    : '';
  const { onMessage: onSocketMessage, updatePresence } = useWebSocket(
    `${WS_BASE}${API_V1}/ws/booking-requests/${bookingRequestId}?token=${token}`,
    (event) => {
      if (event?.code === 4401) {
        setThreadError('Authentication error. Please sign in again.');
      } else {
        setWsFailed(true);
      }
    },
  );

  // ---- Presence updates
  useEffect(() => {
    if (!user?.id) return;
    updatePresence(user.id, 'online');
    const handleVisibility = () => updatePresence(user.id, document.hidden ? 'away' : 'online');
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      updatePresence(user.id, 'offline');
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [updatePresence, user?.id]);

  // ---- WS: merge (array or single), ignore until initial fetch completes
  useEffect(
    () =>
      onSocketMessage((event) => {
        let payload: any;
        try { payload = JSON.parse(event.data); } catch { return; }

        // Handle non-message events
        if (payload?.type === 'typing' && Array.isArray(payload.users)) {
          setTypingUsers(payload.users.filter((id: number) => id !== user?.id));
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setTypingUsers([]), 2000);
          return;
        }
        if (payload?.type === 'presence' || payload?.type === 'reconnect' || payload?.type === 'reconnect_hint' || payload?.type === 'ping') {
          // Presence/heartbeat/reconnect hints are not chat messages
          return;
        }

        // Some backends send arrays or envelopes {messages:[...]}
        const maybeList: any[] = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.messages)
            ? payload.messages
            : [payload];

        if (!initialLoadedRef.current) {
          // Ignore backlog until initial REST load is done to avoid flicker
          return;
        }

        // Only accept items that look like real messages
        const candidateItems = maybeList.filter((item: any) => typeof item?.id === 'number' && !Number.isNaN(item.id));
        if (candidateItems.length === 0) return;
        const normalized = candidateItems.map(normalizeMessage);
        setMessages((prev) => mergeMessages(prev, normalized));

        // Bump header unread badge when new inbound messages arrive
        try {
          const anyInbound = normalized.some((m) => m.sender_id !== user?.id);
          if (anyInbound && typeof window !== 'undefined') {
            window.dispatchEvent(new Event('threads:updated'));
          }
        } catch {}

        // Ensure quotes are hydrated
        for (const m of normalized) {
          const qid = Number(m.quote_id);
          const isQuote =
            qid > 0 &&
            (normalizeType(m.message_type) === 'QUOTE' ||
              (normalizeType(m.message_type) === 'SYSTEM' && m.action === 'review_quote'));
          if (isQuote) void ensureQuoteLoaded(qid);
        }
      }),
    [onSocketMessage, ensureQuoteLoaded, user?.id]
  );

  // ---- Attachment preview URL
  useEffect(() => {
    if (attachmentFile) {
      const url = URL.createObjectURL(attachmentFile);
      setAttachmentPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setAttachmentPreviewUrl(null);
    return () => {};
  }, [attachmentFile]);

  // ---- Scrolling logic
  useEffect(() => {
    if (!messagesContainerRef.current || !messagesEndRef.current) return;
    if (stabilizingRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight <= MIN_SCROLL_OFFSET;
    const shouldAutoScroll =
      messages.length > prevMessageCountRef.current ||
      (typingIndicator && (atBottom || !isUserScrolledUp));
    if (shouldAutoScroll) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, typingIndicator, isUserScrolledUp]);

  const handleScroll = useCallback(() => {
    if (stabilizingRef.current) return;
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < MIN_SCROLL_OFFSET;
    setShowScrollButton(!atBottom);
    setIsUserScrolledUp(!atBottom);
  }, []);
  useEffect(() => {
    handleScroll();
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
      return () => container.removeEventListener('scroll', handleScroll);
    }
    return () => {};
  }, [handleScroll]);

  // ---- iOS scroll unlocks
  const handleTouchStartOnList = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = e.touches?.[0]?.clientY ?? 0;
  }, []);
  const handleTouchMoveOnList = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const y = e.touches?.[0]?.clientY ?? 0;
    const dy = y - touchStartYRef.current;
    if (dy > 6 && document.activeElement === textareaRef.current) {
      textareaRef.current?.blur();
      setShowEmojiPicker(false);
    }
  }, []);
  const handleWheelOnList = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0 && document.activeElement === textareaRef.current) {
      textareaRef.current?.blur();
      setShowEmojiPicker(false);
    }
  }, []);

  // ---- Grouping helpers
  const shouldShowTimestampGroup = useCallback(
    (msg: ThreadMessage, index: number, list: ThreadMessage[]) => {
      if (index === 0) return true;
      const prevMsg = list[index - 1];
      const prevTime = new Date(prevMsg.timestamp).getTime();
      const currTime = new Date(msg.timestamp).getTime();

      const isDifferentDay = format(currTime, 'yyyy-MM-dd') !== format(prevTime, 'yyyy-MM-dd');
      const isTimeGapSignificant = currTime - prevTime >= TEN_MINUTES_MS;
      const isDifferentSender = prevMsg.sender_id !== msg.sender_id || prevMsg.sender_type !== msg.sender_type;

      return isDifferentDay || isTimeGapSignificant || isDifferentSender;
    },
    [],
  );

  // ---- Visible messages (keep it simple; only hide booking-details meta)
  const visibleMessages = useMemo(() => {
    return messages.filter((msg) => {
      const visibleToCurrentUser =
        !msg.visible_to ||
        msg.visible_to === 'both' ||
        (user?.user_type === 'service_provider' && msg.visible_to === 'service_provider') ||
        (user?.user_type === 'client' && msg.visible_to === 'client');

      const isHiddenSystem =
        normalizeType(msg.message_type) === 'SYSTEM' &&
        typeof msg.content === 'string' &&
        msg.content.startsWith(BOOKING_DETAILS_PREFIX);

      // Hide redundant provider-side "Quote sent with total ..." style messages
      const isRedundantQuoteSent =
        normalizeType(msg.message_type) === 'SYSTEM' &&
        typeof msg.content === 'string' &&
        /^\s*quote\s+sent/i.test(msg.content.trim());

      // Hide acceptance-only system notices; payment confirmation supersedes it
      const isAcceptanceOnly =
        normalizeType(msg.message_type) === 'SYSTEM' &&
        typeof msg.content === 'string' &&
        /\baccepted the quote\b/i.test(msg.content);

      // Hide old deposit-style system notices; we use clearer payment copy now
      const isDepositLegacy =
        normalizeType(msg.message_type) === 'SYSTEM' &&
        typeof msg.content === 'string' &&
        /\bdeposit\b/i.test(msg.content);

      return visibleToCurrentUser && !isHiddenSystem && !isRedundantQuoteSent && !isDepositLegacy && !isAcceptanceOnly;
    });
  }, [messages, user?.user_type]);

  const groupedMessages = useMemo(() => {
    const groups: { sender_id: number | null; sender_type: string; messages: ThreadMessage[]; showDayDivider: boolean }[] = [];
    visibleMessages.forEach((msg, idx) => {
      const isNewGroupNeededBase = shouldShowTimestampGroup(msg, idx, visibleMessages);
      const isSystemNow = normalizeType(msg.message_type) === 'SYSTEM';
      const prev = idx > 0 ? visibleMessages[idx - 1] : null;
      const wasSystemPrev = prev ? normalizeType(prev.message_type) === 'SYSTEM' : false;
      const isNewGroupNeeded = isNewGroupNeededBase || isSystemNow || wasSystemPrev;
      const isNewDay =
        idx === 0 ||
        format(new Date(msg.timestamp), 'yyyy-MM-dd') !== format(new Date(visibleMessages[idx - 1].timestamp), 'yyyy-MM-dd');

      if (isNewGroupNeeded || groups.length === 0) {
        groups.push({
          sender_id: msg.sender_id,
          sender_type: msg.sender_type,
          messages: [msg],
          showDayDivider: isNewDay,
        });
      } else {
        const lastGroup = groups[groups.length - 1];
        lastGroup.messages.push(msg);
        if (isNewDay) lastGroup.showDayDivider = true;
      }
    });
    return groups;
  }, [visibleMessages, shouldShowTimestampGroup]);

  // ---- Emoji select
  const handleEmojiSelect = (emoji: { native?: string }) => {
    if (emoji?.native) setNewMessageContent((prev) => `${prev}${emoji.native}`);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  // ---- Send message
  const handleSendMessage = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newMessageContent.trim() && !attachmentFile) return;

      if (attachmentFile && !navigator.onLine) {
        setThreadError('Cannot send attachments while offline.');
        return;
      }

      let attachment_url: string | undefined;
      const tempId = -Date.now(); // negative to avoid collisions

      try {
        if (attachmentFile) {
          setIsUploadingAttachment(true);
          const res = await uploadMessageAttachment(
            bookingRequestId,
            attachmentFile,
            (evt) => {
              if (evt.total) setUploadingProgress(Math.round((evt.loaded * 100) / evt.total));
            },
          );
          attachment_url = res.data.url;
        }

        const payload: MessageCreate = {
          content: newMessageContent.trim(),
          attachment_url,
        };

        // Optimistic
        const optimistic: ThreadMessage = {
          id: tempId,
          booking_request_id: bookingRequestId,
          sender_id: user?.id || 0,
          sender_type: user?.user_type === 'service_provider' ? 'service_provider' : 'client',
          content: payload.content,
          message_type: 'USER',
          quote_id: null,
          attachment_url: attachment_url ?? null,
          visible_to: 'both',
          action: null,
          avatar_url: undefined,
          expires_at: null,
          unread: false,
          is_read: true,
          timestamp: gmt2ISOString(),
          status: navigator.onLine ? 'sending' : 'queued',
        };
        setMessages((prev) => mergeMessages(prev, optimistic));

        const resetInput = () => {
          setNewMessageContent('');
          setAttachmentFile(null);
          setAttachmentPreviewUrl(null);
          setUploadingProgress(0);
          setIsUploadingAttachment(false);
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.rows = 1;
            textareaRef.current.focus();
          }
        };

        if (!navigator.onLine) {
          enqueueMessage({ tempId, payload });
          resetInput();
          return;
        }

        try {
          const res = await postMessageToBookingRequest(bookingRequestId, payload);
          setMessages((prev) => {
            const real = { ...normalizeMessage(res.data), status: 'sent' as const };
            const swapped = prev.map((m) => (m.id === tempId ? real : m));
            return mergeMessages(swapped, []);
          });
          onMessageSent?.();
        } catch (err) {
          console.error('Failed to send message:', err);
          // keep optimistic but mark queued + enqueue
          setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'queued' as const } : m)));
          enqueueMessage({ tempId, payload });
          setThreadError(`Failed to send message. ${(err as Error).message || 'Please try again later.'}`);
        }

        resetInput();
      } catch (err) {
        console.error('Failed to send message:', err);
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' as const } : m)));
        setThreadError(
          `Failed to send message. ${(err as Error).message || 'Please try again later.'}`
        );
        setIsUploadingAttachment(false);
      }
    },
    [
      newMessageContent,
      attachmentFile,
      bookingRequestId,
      onMessageSent,
      textareaRef,
      user?.id,
      user?.user_type,
      enqueueMessage,
    ],
  );

  // ---- Quote actions
  const handleSendQuote = useCallback(
    async (quoteData: QuoteV2Create) => {
      try {
        const res = await createQuoteV2(quoteData);
        const created = res.data;
        setQuotes((prev) => ({ ...prev, [created.id]: created }));
        // No extra system line; the quote card communicates this already.
        setQuoteDrawerId(created.id);
        setQuoteDrawerOpen(true);
        void fetchMessages();
        onMessageSent?.();
        onQuoteSent?.();
      } catch (err) {
        console.error('Failed to send quote:', err);
        setThreadError(`Failed to send quote. ${(err as Error).message || 'Please try again.'}`);
      }
    },
    [fetchMessages, onMessageSent, onQuoteSent, bookingRequestId, user?.id, user?.user_type, clientName],
  );

  const handleDeclineRequest = useCallback(async () => {
    try {
      await updateBookingRequestArtist(bookingRequestId, { status: 'request_declined' });
      void fetchMessages();
      onMessageSent?.();
    } catch (err) {
      console.error('Failed to decline request:', err);
      setThreadError(`Failed to decline request. ${(err as Error).message || 'Please try again.'}`);
    }
  }, [bookingRequestId, fetchMessages, onMessageSent]);

  const handleAcceptQuote = useCallback(
    async (quote: QuoteV2) => {
      let bookingSimple: BookingSimple | null = null;
      try {
        const res = await acceptQuoteV2(quote.id, serviceId);
        bookingSimple = res.data;
      } catch (err) {
        console.error('Failed to accept quote:', err);
        setThreadError(`Failed to accept quote. ${(err as Error).message || 'Please try again.'}`);
        return;
      }

      try {
        const freshQuote = await getQuoteV2(quote.id);
        setQuotes((prev) => ({ ...prev, [quote.id]: freshQuote.data }));

        const bookingId = freshQuote.data.booking_id;
        if (!bookingId) throw new Error('Booking not found after accepting quote');

        const details = await getBookingDetails(bookingId);
        // Store details, but only consider confirmed after payment completes
        setBookingDetails(details.data);

        // Payment modal (triggered separately via onPayNow) will update status
        void fetchMessages();
      } catch (err) {
        console.error('Failed to finalize quote acceptance process:', err);
        setThreadError(`Quote accepted, but there was an issue setting up payment. ${(err as Error).message || 'Please try again.'}`);
      }
    },
    [bookingRequestId, fetchMessages, serviceId, onBookingConfirmedChange, user?.id, user?.user_type, clientName],
  );

  const handleDeclineQuote = useCallback(
    async (quote: QuoteV2) => {
      try {
        await declineQuoteV2(quote.id);
        const updatedQuote = await getQuoteV2(quote.id);
        setQuotes((prev) => ({ ...prev, [quote.id]: updatedQuote.data }));
      } catch (err) {
        console.error('Failed to decline quote:', err);
        setThreadError('Failed to decline quote. Please refresh and try again.');
      }
    },
    [],
  );

  // ---- Request a new quote (client)
  const handleRequestNewQuote = useCallback(async () => {
    try {
      const text = 'Hi! It looks like the quote expired. Could you please send a new quote?';
      const res = await postMessageToBookingRequest(bookingRequestId, { content: text });
      setMessages((prev) => mergeMessages(prev, normalizeMessage(res.data)));
      setThreadError(null);
    } catch (err) {
      console.error('Failed to request new quote:', err);
      setThreadError('Failed to request a new quote. Please try again.');
    }
  }, [bookingRequestId]);

  // ---- Details panel blur on mobile
  useEffect(() => {
    if (isDetailsPanelOpen) {
      textareaRef.current?.blur();
      setShowEmojiPicker(false);
    }
  }, [isDetailsPanelOpen]);

  const effectiveBottomPadding = isDetailsPanelOpen
    ? 'calc(var(--mobile-bottom-nav-height, 0px) + env(safe-area-inset-bottom))'
    : `calc(${composerHeight || 0}px + var(--mobile-bottom-nav-height, 0px) + env(safe-area-inset-bottom))`;

  // ===== Render ===============================================================
  return (
    <div ref={wrapperRef} className="flex flex-col rounded-b-2xl overflow-hidden w-full bg-white h-full min-h-0">
      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        onTouchStart={handleTouchStartOnList}
        onTouchMove={handleTouchMoveOnList}
        onWheel={handleWheelOnList}
        className="relative flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 bg-white px-3 pt-3"
        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', paddingBottom: effectiveBottomPadding }}
      >
        {loading ? (
          <div className="flex justify-center py-6" aria-label="Loading messages">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500" />
          </div>
        ) : (
          visibleMessages.length === 0 && !isSystemTyping && (
            <div className="text-center py-4">
              {user?.user_type === 'client' ? (
                <p className="text-xs text-gray-600">
                  {t('chat.empty.client', 'Your request is in - expect a quote soon. Add any notes or questions below.')}
                  <>
                    <span className="mx-1">·</span>
                    <button
                      type="button"
                      className="text-xs font-medium text-gray-600 underline underline-offset-2"
                      onClick={() => onOpenDetailsPanel?.()}
                    >
                      {t('chat.empty.viewDetails', 'View details')}
                    </button>
                  </>
                </p>
              ) : user?.user_type === 'service_provider' ? (
                <p className="text-xs text-gray-600">
                  {t('chat.empty.artist', 'No messages yet—say hi or share details. You can send a quick quote when you’re ready.')}
                </p>
              ) : (
                <p className="text-xs text-gray-600">
                  {t('chat.empty.default', 'Start the conversation whenever you’re ready.')}
                </p>
              )}
            </div>
          )
        )}

        {user?.user_type === 'service_provider' && !bookingConfirmed && !hasSentQuote && (
          <div className="mb-3" data-testid="artist-inline-quote">
            <MemoInlineQuoteForm
              artistId={currentArtistId}
              clientId={currentClientId}
              bookingRequestId={bookingRequestId}
              serviceName={computedServiceName}
              initialBaseFee={baseFee}
              initialTravelCost={travelFee}
              initialSoundNeeded={initialSound}
              initialSoundCost={initialSoundCost}
              calculationParams={calculationParams}
              onSubmit={handleSendQuote}
              onDecline={handleDeclineRequest}
              eventDetails={eventDetails}
            />
          </div>
        )}

        {/* Grouped messages */}
        {groupedMessages.map((group, idx) => {
          const firstMsgInGroup = group.messages[0];
          // Determine if the first non-system message is from the other party
          const firstNonSystem = group.messages.find((m) => normalizeType(m.message_type) !== 'SYSTEM');
          const showHeader = !!firstNonSystem && firstNonSystem.sender_id !== user?.id;

          return (
            <React.Fragment key={firstMsgInGroup.id}>
              {/* Day Divider */}
              {group.showDayDivider && (
                <div className="flex justify-center my-3 w-full">
                  <span className="px-3 text-[11px] text-gray-500 bg-gray-100 rounded-full py-1">
                    {daySeparatorLabel(new Date(firstMsgInGroup.timestamp))}
                  </span>
                </div>
              )}

              {/* Sender header (show when first visible sender is not self and message is not purely system) */}
              <div className="flex flex-col w-full">
                {showHeader && (
                  <div className="flex items-center mb-1">
                    {user?.user_type === 'service_provider'
                      ? clientAvatarUrl
                        ? (
                            <Image
                              src={getFullImageUrl(clientAvatarUrl) as string}
                              alt="Client avatar"
                              width={20}
                              height={20}
                              className="h-5 w-5 rounded-full object-cover mr-2"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src =
                                  getFullImageUrl('/static/default-avatar.svg') as string;
                              }}
                            />
                          )
                        : (
                            <div className="h-5 w-5 rounded-full bg-gray-300 flex items-center justify-center text-[10px] font-medium mr-2">
                              {clientName?.charAt(0)}
                            </div>
                          )
                      : artistAvatarUrl
                        ? (
                            <Image
                              src={getFullImageUrl(artistAvatarUrl) as string}
                              alt="Service Provider avatar"
                              width={20}
                              height={20}
                              className="h-5 w-5 rounded-full object-cover mr-2"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src =
                                  getFullImageUrl('/static/default-avatar.svg') as string;
                              }}
                            />
                          )
                        : (
                            <div className="h-5 w-5 rounded-full bg-gray-300 flex items-center justify-center text-[10px] font-medium mr-2">
                              {artistName?.charAt(0)}
                            </div>
                          )}
                    <span className="text-[11px] font-semibold text-gray-700">
                      {user?.user_type === 'service_provider' ? clientName : artistName}
                    </span>
                  </div>
                )}

                {/* Bubbles */}
                {group.messages.map((msg, msgIdx) => {
                  const isMsgFromSelf = msg.sender_id === user?.id;
                  const isLastInGroup = msgIdx === group.messages.length - 1;

                  const isSystemMsg = normalizeType(msg.message_type) === 'SYSTEM';

                  let bubbleShape = 'rounded-xl';
                  if (isSystemMsg) {
                    bubbleShape = 'rounded-lg';
                  } else if (isMsgFromSelf) {
                    bubbleShape = isLastInGroup ? 'rounded-br-none rounded-xl' : 'rounded-xl';
                  } else {
                    bubbleShape = isLastInGroup ? 'rounded-bl-none rounded-xl' : 'rounded-xl';
                  }

                  const quoteId = Number(msg.quote_id);
                  const isQuoteMessage =
                    quoteId > 0 &&
                    (normalizeType(msg.message_type) === 'QUOTE' ||
                      (normalizeType(msg.message_type) === 'SYSTEM' && msg.action === 'review_quote'));

                  // Plain system line (except for special actions handled below)
                  if (isSystemMsg && msg.action !== 'view_booking_details' && msg.action !== 'review_quote') {
                    return (
                      <div
                        key={msg.id}
                        className="text-center text-xs text-gray-500 py-2"
                        ref={idx === firstUnreadIndex && msgIdx === 0 ? firstUnreadMessageRef : null}
                      >
                        {msg.content}
                      </div>
                    );
                  }

                  const bubbleBase = isMsgFromSelf ? 'bg-blue-50 text-gray-900' : 'bg-gray-50 text-gray-900';
                  const bubbleClasses = `${bubbleBase} ${bubbleShape}`;
                  const messageTime = format(new Date(msg.timestamp), 'HH:mm');

                  if (isQuoteMessage) {
                    const quoteData = quotes[quoteId];
                    if (!quoteData) return null;
                    const isClient = isClientViewFlag;
                    const isPaid = isPaidFlag;
                    return (
                      <div
                        key={msg.id}
                        id={`quote-${quoteId}`}
                        className="mb-0.5 w/full"
                        ref={idx === firstUnreadIndex && msgIdx === 0 ? firstUnreadMessageRef : null}
                      >
                        {isClient && quoteData.status === 'pending' && !isPaid && (
                          <div className="my-2">
                            <div className="flex items-center gap-3 text-gray-500">
                              <div className="h-px flex-1 bg-gray-200" />
                              <span className="text-[11px]">
                                {t('quote.newFrom', 'New quote from {name}', { name: artistName || 'the artist' })}
                              </span>
                              <div className="h-px flex-1 bg-gray-200" />
                            </div>
                          </div>
                        )}

                        <MemoQuoteBubble
                          quoteId={quoteId}
                          description={quoteData.services[0]?.description || ''}
                          price={Number(quoteData.services[0]?.price || 0)}
                          soundFee={Number(quoteData.sound_fee)}
                          travelFee={Number(quoteData.travel_fee)}
                          accommodation={quoteData.accommodation || undefined}
                          discount={Number(quoteData.discount) || undefined}
                          subtotal={Number(quoteData.subtotal)}
                          total={Number(quoteData.total)}
                          status={
                            quoteData.status === 'pending'
                              ? 'Pending'
                              : quoteData.status === 'accepted'
                                ? 'Accepted'
                                : quoteData.status === 'rejected' || quoteData.status === 'expired'
                                  ? 'Rejected'
                                  : 'Pending'
                          }
                          isClientView={isClientViewFlag}
                          isPaid={isPaidFlag}
                          expiresAt={quoteData.expires_at || undefined}
                          eventDetails={eventDetails}
                          providerName={artistName || 'Service Provider'}
                          providerAvatarUrl={artistAvatarUrl || undefined}
                          providerId={currentArtistId}
                          cancellationPolicy={artistCancellationPolicy || undefined}
                          paymentTerms={'Pay the full amount now via Booka secure checkout'}
                          providerRating={bookingDetails?.service?.service_provider?.rating as any}
                          providerRatingCount={bookingDetails?.service?.service_provider?.rating_count as any}
                          providerVerified={true}
                          mapUrl={(() => {
                            const tb: any = (bookingRequest as any)?.travel_breakdown || {};
                            const name = (parsedBookingDetails as any)?.location_name || tb.venue_name || tb.place_name || tb.location_name || '';
                            const addr = (parsedBookingDetails as any)?.location || tb.address || tb.event_city || tb.event_town || (bookingRequest as any)?.service?.service_provider?.location || '';
                            const q = [name, addr].filter(Boolean).join(', ');
                            return (q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : undefined) as any;
                          })()}
                          includes={(() => {
                            const arr: string[] = [];
                            if (Number(quoteData.sound_fee) > 0) arr.push('Sound equipment');
                            if (Number(quoteData.travel_fee) > 0) arr.push('Travel to venue');
                            arr.push('Performance as described');
                            return arr;
                          })()}
                          excludes={(() => {
                            const arr: string[] = [];
                            if (!Number(quoteData.sound_fee)) arr.push('Sound equipment');
                            arr.push('Venue/Power/Stage');
                            return arr;
                          })()}
                          onViewDetails={() => {
                            setQuoteDrawerId(quoteId);
                            setQuoteDrawerOpen(true);
                          }}
                          onAskQuestion={() => textareaRef.current?.focus()}
                          onAccept={
                            user?.user_type === 'client' && quoteData.status === 'pending' && !bookingConfirmed
                              ? () => handleAcceptQuote(quoteData)
                              : undefined
                          }
                          onPayNow={
                            user?.user_type === 'client' && (quoteData.status === 'pending' || quoteData.status === 'accepted') && !isPaid && !isPaymentOpen
                              ? () => { setIsPaymentOpen(true); openPaymentModal({ bookingRequestId, amount: Number(quoteData.total || 0) } as any); }
                              : undefined
                          }
                          onDecline={
                            user?.user_type === 'client' && quoteData.status === 'pending' && !bookingConfirmed
                              ? () => handleDeclineQuote(quoteData)
                              : undefined
                          }
                        />

                        {isClient && quoteData.status === 'pending' && !bookingConfirmed && (
                          <>
                            <div className="mt-2 mb-2">
                              <div className="flex items-start gap-2 rounded-lg bg-white/60 px-3 py-2 border border-gray-100">
                                <InformationCircleIcon className="h-4 w-4 text-gray-400 mt-0.5" />
                                <div>
                                  <p className="text-[11px] text-gray-600">
                                    {t('quote.guidance.review', 'Review the itemized price and included services. Ask questions if anything looks off.')}
                                  </p>
                                  <p className="text-[11px] text-gray-600 mt-1">
                                    {t('quote.guidance.acceptCta', 'Ready to go? Tap Accept & Pay to confirm your booking now.')}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="my-2">
                              <div className="h-px w-full bg-gray-200" />
                            </div>
                          </>
                        )}

                        {!isClient && quoteData.status === 'pending' && (
                          <div className="mt-2 mb-2">
                            <div className="flex items-start gap-2 rounded-lg bg-white/60 px-3 py-2 border border-gray-100">
                              <InformationCircleIcon className="h-4 w-4 text-gray-400 mt-0.5" />
                              <div>
                                <p className="text-[11px] text-gray-600">
                                  Pending client action — we’ll notify you when they respond.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (isSystemMsg && msg.action === 'review_quote') {
                    return null;
                  }

                  // Reveal images lazily
                  const [revealedImages, setRevealedImages] = [undefined, undefined] as any;

                  return (
                    <div
                      key={msg.id}
                      className={`relative inline-block w-auto max-w-[75%] px-3 py-2 text-[13px] leading-snug ${bubbleClasses} ${msgIdx < group.messages.length - 1 ? 'mb-0.5' : ''} ${isMsgFromSelf ? 'ml-auto mr-0' : 'mr-auto ml-0'}`}
                      ref={idx === firstUnreadIndex && msgIdx === 0 ? firstUnreadMessageRef : null}
                    >
                      <div className="pr-9">
                        {!isMsgFromSelf && !msg.is_read && (
                          <span className="" aria-label="Unread message" />
                        )}

                        {isSystemMsg && msg.action === 'view_booking_details' ? (
                          <Button
                            type="button"
                            onClick={() => {
                              if (!bookingDetails?.id) return;
                              const base =
                                user?.user_type === 'service_provider'
                                  ? '/dashboard/bookings'
                                  : '/dashboard/client/bookings';
                              router.push(`${base}/${bookingDetails.id}`);
                            }}
                            className="text-xs text-indigo-700 underline hover:bg-indigo-50 hover:text-indigo-800 transition-colors"
                          >
                            View Booking Details
                          </Button>
                        ) : (
                          <>
                            {msg.content}
                            {msg.attachment_url && (
                              isImageAttachment(msg.attachment_url) ? (
                                <a
                                  href={getFullImageUrl(msg.attachment_url) as string}
                                  target="_blank"
                                  className="block text-indigo-400 underline mt-1 text-xs hover:text-indigo-300"
                                  rel="noopener noreferrer"
                                >
                                  View image
                                </a>
                              ) : (
                                <a
                                  href={msg.attachment_url}
                                  target="_blank"
                                  className="block text-indigo-400 underline mt-1 text-xs hover:text-indigo-300"
                                  rel="noopener noreferrer"
                                >
                                  {/\/payments\//.test(msg.attachment_url) ? 'View receipt' : 'View attachment'}
                                </a>
                              )
                            )}
                          </>
                        )}
                      </div>

                      {/* Time & status */}
                      <div className="absolute bottom-0.5 right-1.5 flex items-center space-x-0.5 text-[10px] text-right text-gray-500">
                        <time dateTime={msg.timestamp} title={new Date(msg.timestamp).toLocaleString()}>
                          {format(new Date(msg.timestamp), 'HH:mm')}
                        </time>
                        {isMsgFromSelf && (
                          <div className="flex-shrink-0">
                            {msg.status === 'sending' ? (
                              <ClockIcon className="h-4 w-4 text-gray-500 -ml-1" />
                            ) : msg.status === 'failed' ? (
                              <ExclamationTriangleIcon className="h-4 w-4 text-red-500 -ml-1" />
                            ) : (
                              <DoubleCheckmarkIcon className={`h-5 w-5 ${msg.is_read ? 'text-blue-600' : 'text-gray-500'} -ml-[8px]`} />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </React.Fragment>
          );
        })}

        {typingIndicator && <p className="text-xs text-gray-500" aria-live="polite">{typingIndicator}</p>}
        <div ref={messagesEndRef} className="absolute bottom-0 left-0 w-0 h-0" aria-hidden="true" />
      </div>

      {/* Scroll-to-bottom (mobile only) — hidden while details panel is open */}
      {showScrollButton && !isDetailsPanelOpen && (
        <button
          type="button"
          aria-label="Scroll to latest message"
          onClick={() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTo({ top: messagesContainerRef.current.scrollHeight, behavior: 'smooth' });
            }
            setShowScrollButton(false);
            setIsUserScrolledUp(false);
          }}
          className="fixed bottom-24 right-6 z-50 md:hidden rounded-full bg-indigo-600 p-3 text-white shadow-lg hover:bg-indigo-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25L12 15.75 4.5 8.25" />
          </svg>
        </button>
      )}

      {/* Details Card Modal (portal) */}
      {showDetailsCard && isPortalReady && createPortal(
        (
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowDetailsCard(false)} aria-hidden="true" />
            <div role="dialog" aria-modal="true" className="relative z-[10000] w-full sm:max-w-md md:max-w-lg bg-white text-black rounded-2xl shadow-2xl max-h-[92vh] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="text-base font-semibold">Your booking details</h3>
                <button
                  type="button"
                  onClick={() => setShowDetailsCard(false)}
                  className="p-2 rounded-full hover:bg-gray-100"
                  aria-label="Close details"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <BookingSummaryCard
                parsedBookingDetails={parsedBookingDetails}
                imageUrl={bookingDetails?.service?.media_url}
                serviceName={computedServiceName}
                artistName={artistName}
                bookingConfirmed={bookingConfirmed}
                paymentInfo={paymentInfo}
                bookingDetails={bookingDetails}
                quotes={quotes}
                allowInstantBooking={Boolean(allowInstantBooking && user?.user_type === 'client')}
                openPaymentModal={openPaymentModal}
                bookingRequestId={bookingRequestId}
                baseFee={baseFee}
                travelFee={travelFee}
                initialSound={initialSound}
                artistCancellationPolicy={artistCancellationPolicy}
                currentArtistId={currentArtistId}
                instantBookingPrice={instantBookingPrice}
              />
            </div>
          </div>
        ),
        document.body
      )}

      {/* Attachment preview — hide on mobile while details panel open */}
      {attachmentPreviewUrl && (
        <div className={isDetailsPanelOpen ? 'hidden md:flex items-center gap-2 mb-1 bg-gray-100 rounded-xl p-2 shadow-inner' : 'flex items-center gap-2 mb-1 bg-gray-100 rounded-xl p-2 shadow-inner'}>
          {attachmentFile && attachmentFile.type.startsWith('image/') ? (
            <Image
              src={attachmentPreviewUrl}
              alt="Attachment preview"
              width={40}
              height={40}
              loading="lazy"
              className="w-10 h-10 object-cover rounded-md border border-gray-200"
            />
          ) : (
            <>
              {attachmentFile?.type === 'application/pdf' ? (
                <DocumentIcon className="w-8 h-8 text-red-600" />
              ) : (
                <DocumentTextIcon className="w-8 h-8 text-gray-600" />
              )}
              <span className="text-xs text-gray-700 font-medium">{attachmentFile?.name}</span>
            </>
          )}
          <button
            type="button"
            onClick={() => setAttachmentFile(null)}
            className="text-xs text-red-600 hover:text-red-700 font-medium"
            aria-label="Remove attachment"
          >
            Remove
          </button>
        </div>
      )}

      {/* Composer — hidden on mobile while details panel is open */}
      {user && (
        <>
          <div
            ref={composerRef}
            data-testid="composer-container"
            className={
              isDetailsPanelOpen
                ? 'hidden md:block sticky bottom-0 z-[60] bg-white border-t border-gray-100 shadow pb-safe flex-shrink-0 relative'
                : 'block sticky bottom-0 z-[60] bg-white border-t border-gray-100 shadow pb-safe flex-shrink-0 relative'
            }
          >
            {showEmojiPicker && (
              <div ref={emojiPickerRef} className="absolute bottom-12 left-0 z-50">
                <EmojiPicker data={data} onEmojiSelect={handleEmojiSelect} previewPosition="none" />
              </div>
            )}

            <form onSubmit={handleSendMessage} className="flex items-center gap-x-1.5 px-2 pt-1.5 pb-1.5">
              <input
                id="file-upload"
                type="file"
                className="hidden"
                onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                accept="image/*,application/pdf"
              />
              <label
                htmlFor="file-upload"
                aria-label="Upload attachment"
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-500 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </label>

              <button
                type="button"
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                aria-label="Add emoji"
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-500 rounded-full hover:bg-gray-100 transition-colors"
              >
                <FaceSmileIcon className="w-5 h-5" />
              </button>

              {/* Textarea (16px to avoid iOS zoom) */}
              <textarea
                ref={textareaRef}
                value={newMessageContent}
                onChange={(e) => setNewMessageContent(e.target.value)}
                onInput={autoResizeTextarea}
                autoFocus
                rows={1}
                className="flex-grow rounded-xl px-3 py-1 border border-gray-300 shadow-sm resize-none text-base ios-no-zoom font-medium focus:outline-none min-h-[36px]"
                placeholder="Type your message..."
                aria-label="New message input"
                disabled={isUploadingAttachment}
              />

              {isUploadingAttachment && (
                <div
                  className="flex items-center gap-1"
                  role="progressbar"
                  aria-label="Upload progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={uploadingProgress}
                  aria-valuetext={`${uploadingProgress}%`}
                >
                  <div className="w-10 bg-gray-200 rounded-full h-1">
                    <div className="h-1 rounded-full bg-indigo-500" style={{ width: `${uploadingProgress}%` }} />
                  </div>
                  <span className="text-[11px] text-gray-600">{uploadingProgress}%</span>
                </div>
              )}

              <Button
                type="submit"
                aria-label="Send message"
                className="flex-shrink-0 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center w-9 h-9 p-2"
                disabled={isUploadingAttachment || (!newMessageContent.trim() && !attachmentFile)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </Button>
            </form>
          </div>

          {/* Leave Review (hidden on mobile when panel open) */}
          {user?.user_type === 'client' &&
            bookingDetails &&
            bookingDetails.status === 'completed' &&
            !(bookingDetails as Booking & { review?: Review }).review && (
              <div className={isDetailsPanelOpen ? 'hidden md:block' : 'block'}>
                <Button
                  type="button"
                  onClick={() => onShowReviewModal?.(true)}
                  className="mt-1.5 text-xs text-indigo-700 underline hover:bg-indigo-50 hover:text-indigo-800 transition-colors"
                >
                  Leave Review
                </Button>
              </div>
            )}

          {paymentModal}
        </>
      )}

      {/* Slide-in Quote Drawer */}
      <QuoteDrawer
        isOpen={quoteDrawerOpen}
        onClose={() => setQuoteDrawerOpen(false)}
        quote={quoteDrawerId ? quotes[quoteDrawerId] : undefined}
        booking={bookingDetails}
        isClientView={isClientViewFlag}
        isPaid={isPaidFlag}
        onRequestNewQuote={isClientViewFlag ? handleRequestNewQuote : undefined}
        topOffset={quoteDrawerTopOffset}
        onAccept={(() => {
          const q = quoteDrawerId ? quotes[quoteDrawerId] : undefined;
          if (!q || !isClientViewFlag || q.status !== 'pending' || isPaidFlag) return undefined;
          return () => handleAcceptQuote(q);
        })()}
        onPayNow={(() => {
          const q = quoteDrawerId ? quotes[quoteDrawerId] : undefined;
          if (!q || !isClientViewFlag || (q.status !== 'pending' && q.status !== 'accepted') || isPaidFlag || isPaymentOpen) return undefined;
          return () => { setIsPaymentOpen(true); openPaymentModal({ bookingRequestId, amount: Number(q.total || 0) } as any); };
        })()}
        onDecline={(() => {
          const q = quoteDrawerId ? quotes[quoteDrawerId] : undefined;
          if (!q || !isClientViewFlag || q.status !== 'pending' || isPaidFlag) return undefined;
          return () => handleDeclineQuote(q);
        })()}
        onOpenReceipt={(() => {
          if (!bookingDetails?.payment_id) return undefined;
          return () => window.open(`/api/v1/payments/${bookingDetails.payment_id}/receipt`, '_blank');
        })()}
        eventSummary={(() => {
          const parts: string[] = [];
          if (parsedBookingDetails?.eventType) parts.push(parsedBookingDetails.eventType);
          if (parsedBookingDetails?.date) {
            const d = new Date(parsedBookingDetails.date);
            if (!isNaN(d.getTime())) parts.push(format(d, 'PPP'));
          }
          // Location: prefer name — address when available
          const rawLoc = (parsedBookingDetails?.location || '').trim();
          const locName = (parsedBookingDetails as any)?.location_name as string | undefined;
          let name = (locName || '').trim();
          let addr = '';
          if (!name && rawLoc) {
            const partsLoc = rawLoc.split(',');
            const first = (partsLoc[0] || '').trim();
            if (first && !/^\d/.test(first)) {
              name = first;
              addr = partsLoc.slice(1).join(',').trim();
            } else {
              addr = rawLoc;
            }
          } else if (name) {
            addr = rawLoc;
          }
          const locLabel = name ? (addr ? `${name} — ${addr}` : name) : (addr || '');
          if (locLabel) parts.push(locLabel);
          if (parsedBookingDetails?.guests) parts.push(`${parsedBookingDetails.guests} guests`);
          return parts.length ? parts.join(' – ') : null;
        })()}
      />

      {/* Errors */}
      {threadError && (
        <p className="text-xs text-red-600 p-4 mt-1.5" role="alert">{threadError}</p>
      )}
      {wsFailed && (
        <p className="text-xs text-red-600 p-4 mt-1.5" role="alert">
          Connection lost. Please refresh the page or sign in again.
        </p>
      )}
    </div>
  );
});

MessageThread.displayName = 'MessageThread';
export default React.memo(MessageThread);
