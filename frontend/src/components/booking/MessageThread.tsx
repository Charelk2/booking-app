// frontend/src/components/booking/MessageThread.tsx
'use client';

import React, {
  useEffect,
  useLayoutEffect,
  useState,
  forwardRef,
  useImperativeHandle,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import Image from 'next/image';
import SafeImage from '@/components/ui/SafeImage';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { format, isValid, differenceInCalendarDays, startOfDay } from 'date-fns';
import data from '@emoji-mart/data';
import { DocumentIcon, DocumentTextIcon, FaceSmileIcon, ChevronDownIcon, MusicalNoteIcon, PaperClipIcon } from '@heroicons/react/24/outline';
import { ClockIcon, ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { MicrophoneIcon, XMarkIcon } from '@heroicons/react/24/outline';

import {
  getFullImageUrl,
} from '@/lib/utils';
import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';
import { parseBookingDetailsFromMessage } from '@/lib/bookingDetails';
import { isSystemMessage as isSystemMsgHelper, systemLabel } from '@/lib/systemMessages';

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
    getQuotesBatch,
    acceptQuoteV2,
    declineQuoteV2,
    getBookingDetails,
    getMyClientBookings,
    getBookingRequestById,
    markMessagesRead,
    markThreadRead,
    updateBookingRequestArtist,
    useAuth,
    deleteMessageForBookingRequest,
  } from '@/lib/api';

import useOfflineQueue from '@/hooks/useOfflineQueue';
import usePaymentModal from '@/hooks/usePaymentModal';
import useWebSocket from '@/hooks/useWebSocket';
import useBookingView from '@/hooks/useBookingView';

import Button from '../ui/Button';
import { addMessageReaction, removeMessageReaction } from '@/lib/api';
import QuoteBubble from './QuoteBubble';
import InlineQuoteForm from './InlineQuoteForm';
import BookingSummaryCard from './BookingSummaryCard';
import { t } from '@/lib/i18n';
import EventPrepCard from './EventPrepCard';
import { ImagePreviewModal } from '@/components/ui';

const EmojiPicker = dynamic(() => import('@emoji-mart/react'), { ssr: false });
const MemoQuoteBubble = React.memo(QuoteBubble);
const MemoInlineQuoteForm = React.memo(InlineQuoteForm);

// ===== Constants ==============================================================
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_BASE = API_BASE.replace(/^http/, 'ws');
const API_V1 = '/api/v1';
const TEN_MINUTES_MS = 10 * 60 * 1000;
const MIN_SCROLL_OFFSET = 24;
const BOTTOM_GAP_PX = 8;
const MAX_TEXTAREA_LINES = 10;
const isImageAttachment = (url?: string | null) =>
  !!url && /\.(jpe?g|png|gif|webp)$/i.test(url);

const gmt2ISOString = () =>
  new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().replace('Z', '+02:00');

const normalizeType = (v?: string | null) => (v ?? '').toUpperCase();
const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${i === 0 ? Math.round(val) : val.toFixed(1)} ${sizes[i]}`;
};

// Proxy backend static/media URLs through Next so iframes/audio are same-origin
const toProxyPath = (url: string): string => {
  try {
    const api = new URL(API_BASE);
    const u = new URL(url, API_BASE);
    const sameOrigin = u.protocol === api.protocol && u.hostname === api.hostname && (u.port || '') === (api.port || '');
    if (sameOrigin) {
      if (u.pathname.startsWith('/static/')) return u.pathname + u.search;
      if (u.pathname.startsWith('/media/')) return u.pathname + u.search;
    }
  } catch {}
  return url;
};
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
  system_key?: string | null;
  quote_id?: number | null;
  attachment_url?: string | null;
  visible_to?: 'client' | 'service_provider' | 'both'; // normalized
  action?: string | null;
  avatar_url?: string | null;
  expires_at?: string | null;
  unread?: boolean;
  timestamp: string;
  status?: MessageStatus;
  // Optional reaction fields coming from the API; we also keep a separate
  // reactions state map for live updates & aggregates
  reactions?: Record<string, number> | null;
  my_reactions?: string[] | null;
  // Reply metadata (if this message is a reply to another)
  reply_to_message_id?: number | null;
  reply_to_preview?: string | null;
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
    system_key: raw.system_key ?? null,
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
    reactions: (raw as any).reactions || null,
    my_reactions: (raw as any).my_reactions || null,
    reply_to_message_id: (raw as any).reply_to_message_id ?? null,
    reply_to_preview: (raw as any).reply_to_preview ?? null,
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

  const arr: ThreadMessage[] = [];
  map.forEach((v) => arr.push(v));
  return arr.sort(
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
  /** Disable the chat composer for system-only threads (e.g., Booka updates). */
  disableComposer?: boolean;
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
    disableComposer = false,
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
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
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
  const [imageModalIndex, setImageModalIndex] = useState<number | null>(null);
  const [filePreviewSrc, setFilePreviewSrc] = useState<string | null>(null);
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
  const distanceFromBottomRef = useRef<number>(0);
  const prevScrollHeightRef = useRef<number>(0);
  const prevComposerHeightRef = useRef<number>(0);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const prevMessageCountRef = useRef(0);
  const initialScrolledRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const firstUnreadMessageRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadedRef = useRef(false); // gate WS until first REST load
  const touchStartYRef = useRef(0);
  const stabilizingRef = useRef(true);
  const stabilizeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fetchInFlightRef = useRef(false);
  const activeThreadRef = useRef<number | null>(null);

  // Local ephemeral features
  const [replyTarget, setReplyTarget] = useState<ThreadMessage | null>(null);
  const [reactions, setReactions] = useState<Record<number, Record<string, number>>>({});
  const [myReactions, setMyReactions] = useState<Record<number, Set<string>>>({});
  const myReactionsRef = useRef<Record<number, Set<string>>>({});
  useEffect(() => { myReactionsRef.current = myReactions; }, [myReactions]);
  const [reactionPickerFor, setReactionPickerFor] = useState<number | null>(null);
  const [actionMenuFor, setActionMenuFor] = useState<number | null>(null);
  const reactionPickerRefDesktop = useRef<HTMLDivElement | null>(null);
  const reactionPickerRefMobile = useRef<HTMLDivElement | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const [imageMenuFor, setImageMenuFor] = useState<number | null>(null);
  const imageMenuRef = useRef<HTMLDivElement | null>(null);
  // Simple responsive helper (reactive)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const update = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const mobileOverlayOpenedAtRef = useRef<number>(0);

  // When mobile long-press overlay is open, ensure composer does not focus/type
  const isMobileOverlayOpen = isMobile && actionMenuFor !== null;
  useEffect(() => {
    if (isMobileOverlayOpen) {
      try { textareaRef.current?.blur(); } catch {}
    }
  }, [isMobileOverlayOpen]);
  // Long-press (mobile) to open actions menu
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressFiredRef = useRef<boolean>(false);
  const longPressMsgIdRef = useRef<number | null>(null);
  const longPressStartTimeRef = useRef<number>(0);
  const [copiedFor, setCopiedFor] = useState<number | null>(null);
  const [highlightFor, setHighlightFor] = useState<number | null>(null);

  // Smooth-scroll to a message by id and briefly highlight it
  const scrollToMessage = useCallback((mid: number) => {
    const el = typeof document !== 'undefined' ? document.getElementById(`msg-${mid}`) : null;
    if (!el) return;
    try {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth' });
    }
    setHighlightFor(mid);
    setTimeout(() => {
      setHighlightFor((v) => (v === mid ? null : v));
    }, 1500);
  }, []);

  // Close pickers/menus when clicking outside
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // When mobile overlay is open, let its handlers manage open/close
      if (isMobile && actionMenuFor !== null) return;
      if (reactionPickerFor) {
        const inDesktop = reactionPickerRefDesktop.current?.contains(t) ?? false;
        const inMobile = reactionPickerRefMobile.current?.contains(t) ?? false;
        if (!inDesktop && !inMobile) setReactionPickerFor(null);
      }
      if (actionMenuFor && actionMenuRef.current && !actionMenuRef.current.contains(t)) {
        setActionMenuFor(null);
      }
      if (imageMenuFor && imageMenuRef.current && !imageMenuRef.current.contains(t)) {
        setImageMenuFor(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (reactionPickerFor) setReactionPickerFor(null);
        if (actionMenuFor) setActionMenuFor(null);
        if (imageMenuFor) setImageMenuFor(null);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [reactionPickerFor, actionMenuFor, imageMenuFor]);

  const startLongPress = useCallback((msgId: number, e: React.TouchEvent) => {
    try {
      const t = e.touches?.[0];
      if (!t) return;
      longPressPosRef.current = { x: t.clientX, y: t.clientY };
      longPressFiredRef.current = false;
      longPressMsgIdRef.current = msgId;
      longPressStartTimeRef.current = Date.now();
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = setTimeout(() => {
        longPressFiredRef.current = true;
        setReactionPickerFor(null);
        setImageMenuFor(null);
        setActionMenuFor(msgId);
        // Also prime reactions for this message so the picker can render in modal (mobile)
        setReactionPickerFor(msgId);
        mobileOverlayOpenedAtRef.current = Date.now();
        try { (navigator as any)?.vibrate?.(10); } catch {}
      }, 250);
    } catch {}
  }, []);

  const moveLongPress = useCallback((e: React.TouchEvent) => {
    const start = longPressPosRef.current;
    const t = e.touches?.[0];
    if (!start || !t) return;
    const dx = Math.abs(t.clientX - start.x);
    const dy = Math.abs(t.clientY - start.y);
    if (dx > 10 || dy > 10) {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const endLongPress = useCallback((e?: React.TouchEvent) => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    // If long-press did not fire, treat as single tap on mobile for reply jump
    if (!longPressFiredRef.current) {
      try {
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
        const msgId = longPressMsgIdRef.current;
        if (!isMobile || !msgId) return;
        // Ignore taps on interactive child elements
        const target = e?.target as HTMLElement | undefined;
        let el: HTMLElement | null | undefined = target;
        let interactive = false;
        while (el && el !== document.body) {
          const tag = (el.tagName || '').toUpperCase();
          if (tag === 'BUTTON' || tag === 'A' || tag === 'IMG' || tag === 'AUDIO' || el.getAttribute('role') === 'button') {
            interactive = true; break;
          }
          el = el.parentElement as HTMLElement | null;
        }
        if (interactive) return;
        const m = messages.find((mm) => mm.id === msgId);
        if (m?.reply_to_message_id) {
          e?.preventDefault();
          e?.stopPropagation();
          scrollToMessage(m.reply_to_message_id);
        }
      } catch {}
    }
  }, [messages, scrollToMessage]);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // ---- Presence
  const [typingUsers, setTypingUsers] = useState<number[]>([]);

  // ---- Derived
  const computedServiceName = serviceName ?? bookingDetails?.service?.title;
  const serviceTypeFromThread = bookingRequest?.service?.service_type || bookingDetails?.service?.service_type || '';
  const isPersonalizedVideo = String(serviceTypeFromThread).toLowerCase() === 'personalized video'.toLowerCase();
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

  // List of image URLs in this thread (for modal navigation)
  const imageMessages = useMemo(() => messages.filter((m) => isImageAttachment(m.attachment_url || undefined)), [messages]);
  const imageUrls = useMemo(() => imageMessages.map((m) => getFullImageUrl(m.attachment_url!) as string), [imageMessages]);
  const openImageModalForUrl = useCallback((url: string) => {
    const idx = imageUrls.indexOf(url);
    setImageModalIndex(idx >= 0 ? idx : null);
  }, [imageUrls]);

  const { isClientView: isClientViewFlag, isProviderView: isProviderViewFlag, isPaid: isPaidFlag } = useBookingView(user, bookingDetails, paymentInfo, bookingConfirmed);

  // When the thread is for admin moderation (e.g., listing approved/rejected),
  // do not show booking-request specific UI like the inline quote editor.
  const isModerationThread = useMemo(() => {
    const firstSystem = messages.find((m) => String(m.message_type).toUpperCase() === 'SYSTEM');
    const key = (firstSystem as any)?.system_key ? String((firstSystem as any).system_key).toLowerCase() : '';
    const content = String((firstSystem as any)?.content || '').toLowerCase();
    if (key.startsWith('listing_approved_v1') || key.startsWith('listing_rejected_v1')) return true;
    if (content.startsWith('listing approved:') || content.startsWith('listing rejected:')) return true;
    return false;
  }, [messages]);

  // ---- Focus textarea on mount & thread switch
  useEffect(() => { textareaRef.current?.focus(); }, []);
  useEffect(() => { textareaRef.current?.focus(); }, [bookingRequestId]);

  // ---- Portal ready
  useEffect(() => { setIsPortalReady(true); }, []);

  // (Quote drawer removed)

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
    if (!ta || textareaLineHeight === 0) return;
    ta.style.height = 'auto';

    const style = getComputedStyle(ta);
    const padT = parseFloat(style.paddingTop);
    const bdrT = parseFloat(style.borderTopWidth);
    const bdrB = parseFloat(style.borderBottomWidth);
    const maxH = textareaLineHeight * MAX_TEXTAREA_LINES + padT + bdrT + bdrB;
    const newH = Math.min(ta.scrollHeight, maxH);
    ta.style.height = `${newH}px`;
    // Do not adjust message list scroll position on composer growth to avoid jitter while typing
  }, [textareaLineHeight]);
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
      // If the user switched threads while this request was in flight, ignore the result
      if (activeThreadRef.current !== bookingRequestId) {
        return;
      }

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

      // Ensure quotes referenced are hydrated (batch first, then per-id for any still missing)
      try {
        const qids = Array.from(new Set(
          normalized
            .map((m) => Number(m.quote_id))
            .filter((qid) => qid > 0)
        ));
        const missing = qids.filter((id) => !quotes[id]);
        if (missing.length) {
          const batch = await getQuotesBatch(missing);
          const got = Array.isArray(batch.data) ? batch.data : [];
          if (got.length) {
            setQuotes((prev) => ({
              ...prev,
              ...Object.fromEntries(got.map((q: any) => [q.id, q])),
            }));
          }
          // Some backends only batch-return legacy quotes; hydrate any V2 IDs individually
          const receivedIds = new Set<number>(got.map((q: any) => Number(q?.id)).filter((n) => !Number.isNaN(n)));
          const stillMissing = missing.filter((id) => !receivedIds.has(id));
          for (const id of stillMissing) {
            try { await ensureQuoteLoaded(id); } catch {}
          }
        }
      } catch (e) {
        // Fall back to per-quote fetch
        for (const m of normalized) {
          const qid = Number(m.quote_id);
          const isQuote =
            qid > 0 &&
            (normalizeType(m.message_type) === 'QUOTE' ||
              (normalizeType(m.message_type) === 'SYSTEM' && m.action === 'review_quote'));
          if (isQuote) void ensureQuoteLoaded(qid);
        }
      }

      setMessages((prev) => mergeMessages(prev.length ? prev : [], normalized));
      // hydrate reactions and my reactions from response if present
      try {
        const newReactions: Record<number, Record<string, number>> = {};
        const newMine: Record<number, Set<string>> = {};
        (normalized as any[]).forEach((m: any) => {
          if (m.reactions) newReactions[m.id] = m.reactions;
          if (m.my_reactions) newMine[m.id] = new Set<string>(m.my_reactions);
        });
        if (Object.keys(newReactions).length) setReactions((prev) => ({ ...prev, ...newReactions }));
        if (Object.keys(newMine).length) setMyReactions((prev) => ({ ...prev, ...newMine }));
      } catch {}
      setThreadError(null);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
      setThreadError(`Failed to load messages. ${(err as Error).message || 'Please try again.'}`);
    } finally {
      setLoading(false);
      initialLoadedRef.current = true; // <— gate opens: WS can merge now
      // Defer initial scroll to a layout effect to avoid any visible jump
      stabilizingRef.current = true;
      if (stabilizeTimerRef.current) clearTimeout(stabilizeTimerRef.current);
      stabilizeTimerRef.current = setTimeout(() => {
        stabilizingRef.current = false;
      }, 250);
      fetchInFlightRef.current = false;
    }
  }, [bookingRequestId, user?.id, initialNotes, onBookingDetailsParsed, ensureQuoteLoaded]);
  useImperativeHandle(ref, () => ({ refreshMessages: fetchMessages }), [fetchMessages]);
  useEffect(() => {
    activeThreadRef.current = bookingRequestId;
    fetchMessages();
  }, [bookingRequestId, fetchMessages]);

  // Reset initial scrolled flag when switching threads
  useEffect(() => {
    initialScrolledRef.current = false;
    prevMessageCountRef.current = 0;
  }, [bookingRequestId]);

  // Hard-reset thread state on conversation switch to avoid cross-thread merging
  useEffect(() => {
    setMessages([]);
    setQuotes({});
    setBookingDetails(null);
    setBookingRequest(null);
    setParsedBookingDetails(undefined);
    setBookingConfirmed(false);
    setPaymentInfo({ status: null, amount: null, receiptUrl: null });
    setIsPaymentOpen(false);
    setTypingUsers([]);
    setWsFailed(false);
    setShowDetailsCard(false);
    setReactions({});
    setMyReactions({});
    setReplyTarget(null);
    setActionMenuFor(null);
    setReactionPickerFor(null);
    setImageFiles([]);
    setImagePreviewUrls([]);
    setAttachmentFile(null);
    setAttachmentPreviewUrl(null);
    setThreadError(null);
    setLoading(true);
    initialLoadedRef.current = false;
  }, [bookingRequestId]);

  // Ensure the thread starts anchored at bottom on first load, without a noticeable scroll
  useLayoutEffect(() => {
    if (!initialLoadedRef.current) return;
    if (initialScrolledRef.current) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    try {
      el.scrollTop = el.scrollHeight;
      prevScrollHeightRef.current = el.scrollHeight;
      distanceFromBottomRef.current = 0;
    } catch {}
    initialScrolledRef.current = true;
  }, [messages.length, bookingRequestId]);

  // Resolve booking from request for paid/confirmed state (client path)
  const resolveBookingFromRequest = useCallback(async () => {
    // Ignore if user switched threads
    if (activeThreadRef.current !== bookingRequestId) return null;
    try {
      const list = await getMyClientBookings();
      if (activeThreadRef.current !== bookingRequestId) return null;
      const arr = list.data || [];
      const match = arr.find((b: any) => b.booking_request_id === bookingRequestId);
      if (match && (!bookingDetails || bookingDetails.id !== match.id)) {
        const full = await getBookingDetails(match.id);
        if (activeThreadRef.current !== bookingRequestId) return null;
        setBookingDetails(full.data);
        return full.data;
      }
    } catch (e) {
      // ignore
    }
    return null;
  }, [bookingRequestId, bookingDetails]);

  // ---- Payment modal (moved after fetchMessages is defined)
  const { openPaymentModal, paymentModal } = usePaymentModal(
    useCallback(async ({ status, amount, receiptUrl: url, paymentId, mocked }) => {
      setPaymentInfo({ status: status ?? null, amount: amount ?? null, receiptUrl: url ?? null });
      if (status === 'paid') {
        setBookingConfirmed(true);
        onBookingConfirmedChange?.(true, bookingDetails);
        try { localStorage.setItem(`booking-confirmed-${bookingRequestId}`, '1'); } catch {}
        if (paymentId) {
          setBookingDetails((prev) => (prev ? { ...prev, payment_id: paymentId as any } : prev));
        }
        if (mocked) {
          try {
            // Persist a canonical system message so it survives refresh even in mock mode
            const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/+$/,'');
            const receiptLink = url || (paymentId ? `${apiBase}/api/v1/payments/${paymentId}/receipt` : undefined);
            await postMessageToBookingRequest(bookingRequestId, {
              content: `Payment received. Your booking is confirmed and the date is secured.${receiptLink ? ` Receipt: ${receiptLink}` : ''}`,
              message_type: 'SYSTEM',
              action: 'payment_received',
              // system_key is accepted on backend; pass it for idempotency if supported
              // @ts-ignore – extra field tolerated by backend
              system_key: 'payment_received',
              visible_to: 'both',
            } as any);
          } catch (e) {
            // non-fatal; UI still shows local message until next load
          }
        }
        // Fetch fresh messages so the server-authored (or persisted) system line shows up and persists
        void fetchMessages();
        // Also resolve booking from this thread so Event Prep can render immediately
        void resolveBookingFromRequest();
      }
      setIsPaymentOpen(false);
      onPaymentStatusChange?.(status, amount, url ?? null);
    }, [onPaymentStatusChange, bookingDetails, onBookingConfirmedChange, fetchMessages]),
    useCallback(() => { setIsPaymentOpen(false); }, []),
  );

  // ---- WS connection
  const token = typeof window !== 'undefined'
    ? (localStorage.getItem('token') || sessionStorage.getItem('token') || null)
    : null;
  // Do not attempt to open a WebSocket when no auth token is available
  const wsUrl = token
    ? `${WS_BASE}${API_V1}/ws/booking-requests/${bookingRequestId}?token=${encodeURIComponent(token)}`
    : null;
  const { onMessage: onSocketMessage, updatePresence } = useWebSocket(
    wsUrl,
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
        if (activeThreadRef.current !== bookingRequestId) return;
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

        // Event prep updates are handled by the EventPrepCard subscriber
        if (payload?.type === 'event_prep_updated') {
          return;
        }

        // Live reaction updates
        if (payload?.type === 'reaction_added' && payload?.payload) {
          const { message_id, emoji, user_id } = payload.payload as { message_id: number; emoji: string; user_id: number };
          if (user_id === user?.id) {
            const mine = myReactionsRef.current[message_id];
            if (mine && mine.has(emoji)) return; // already applied optimistically
          }
          setReactions((prev) => {
            const cur = { ...(prev[message_id] || {}) } as Record<string, number>;
            cur[emoji] = (cur[emoji] || 0) + 1;
            return { ...prev, [message_id]: cur };
          });
          if (user_id === user?.id) {
            setMyReactions((m) => {
              const set = new Set(m[message_id] || []);
              set.add(emoji);
              return { ...m, [message_id]: set };
            });
          }
          return;
        }
        if (payload?.type === 'reaction_removed' && payload?.payload) {
          const { message_id, emoji, user_id } = payload.payload as { message_id: number; emoji: string; user_id: number };
          if (user_id === user?.id) {
            const mine = myReactionsRef.current[message_id];
            if (!mine || !mine.has(emoji)) return; // already applied optimistically
          }
          setReactions((prev) => {
            const cur = { ...(prev[message_id] || {}) } as Record<string, number>;
            cur[emoji] = Math.max(0, (cur[emoji] || 0) - 1);
            return { ...prev, [message_id]: cur };
          });
          if (user_id === user?.id) {
            setMyReactions((m) => {
              const set = new Set(m[message_id] || []);
              set.delete(emoji);
              return { ...m, [message_id]: set };
            });
          }
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

  // Image previews for multiple image attachments
  useEffect(() => {
    // Revoke stale URLs
    return () => {
      try { imagePreviewUrls.forEach((u) => URL.revokeObjectURL(u)); } catch {}
    };
  }, []);
  const addImageFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    setImageFiles((prev) => [...prev, ...imgs]);
    const urls = imgs.map((f) => URL.createObjectURL(f));
    setImagePreviewUrls((prev) => [...prev, ...urls]);
  }, []);
  const removeImageAt = useCallback((idx: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== idx));
    setImagePreviewUrls((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(idx, 1);
      try { if (removed) URL.revokeObjectURL(removed); } catch {}
      return copy;
    });
  }, []);

  // ---- Scrolling logic
  useEffect(() => {
    if (!messagesContainerRef.current || !messagesEndRef.current) return;
    if (stabilizingRef.current) return;
    const anchored = distanceFromBottomRef.current <= MIN_SCROLL_OFFSET;
    const shouldAutoScroll = messages.length > prevMessageCountRef.current || (typingIndicator && anchored);
    if (shouldAutoScroll) {
      try {
        messagesContainerRef.current.scrollTo({ top: messagesContainerRef.current.scrollHeight, behavior: 'auto' });
      } catch {}
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, typingIndicator]);

  const handleScroll = useCallback(() => {
    if (stabilizingRef.current) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    distanceFromBottomRef.current = distance;
    const atBottom = distance <= MIN_SCROLL_OFFSET;
    setShowScrollButton(!atBottom);
    setIsUserScrolledUp(!atBottom);
    prevScrollHeightRef.current = el.scrollHeight;
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
    const filtered = messages.filter((msg) => {
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

      return visibleToCurrentUser && !isHiddenSystem && !isRedundantQuoteSent;
    });

    // Global dedupe: only show a given SYSTEM line once (same system_key+content)
    const seen = new Set<string>();
    const deduped: ThreadMessage[] = [];
    for (const msg of filtered) {
      if (normalizeType(msg.message_type) === 'SYSTEM') {
        const key = `${(msg.system_key || '').toLowerCase()}|${String(msg.content || '').trim().toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      deduped.push(msg);
    }

    // Ensure inquiry card (inquiry_sent_v1) renders after the first client USER message
    try {
      const isInquiry = (m: ThreadMessage) => {
        const key = ((m as any).system_key || '').toString().toLowerCase();
        if (key === 'inquiry_sent_v1') return true;
        const raw = String((m as any).content || '');
        return raw.startsWith('{') && raw.includes('inquiry_sent_v1');
      };
      const inquiryIdx = deduped.findIndex(isInquiry);
      const firstUserIdx = deduped.findIndex(
        (m) => normalizeType(m.message_type) !== 'SYSTEM' && m.sender_type === 'client'
      );
      if (inquiryIdx !== -1 && firstUserIdx !== -1 && inquiryIdx < firstUserIdx) {
        const [inq] = deduped.splice(inquiryIdx, 1);
        deduped.splice(firstUserIdx + 1, 0, inq);
      }
    } catch {}

    return deduped;
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

  // Hide artist inline quote composer for pure inquiry threads created from profile page
  // Also treat threads started via message-threads/start (no booking details/quotes yet) as inquiries
  const isInquiryThread = useMemo(() => {
    try {
      // Explicit inquiry card
      for (const m of messages) {
        if (normalizeType(m.message_type) !== 'SYSTEM') continue;
        const key = (m as any).system_key ? String((m as any).system_key).toLowerCase() : '';
        if (key === 'inquiry_sent_v1') return true;
        const raw = String((m as any).content || '');
        if (raw.startsWith('{') && raw.includes('inquiry_sent_v1')) return true;
      }
      // Implicit inquiry: first messages but no quotes or booking details yet
      const hasQuoteLike = messages.some(
        (m) => Number(m.quote_id) > 0 || (normalizeType(m.message_type) === 'SYSTEM' && m.action === 'review_quote')
      );
      if (hasQuoteLike) return false;
      const hasClientUserMsg = messages.some(
        (m) => normalizeType(m.message_type) !== 'SYSTEM' && m.sender_type === 'client'
      );
      const hasDetails = Boolean(parsedBookingDetails) || Boolean(bookingRequest?.travel_breakdown);
      // If we have a client intro but no details/quotes yet, consider it an inquiry
      if (hasClientUserMsg && !hasDetails) return true;
    } catch {}
    return false;
  }, [messages, parsedBookingDetails, bookingRequest]);

  // ---- System message rendering (centralized)
  const renderSystemLine = useCallback((msg: ThreadMessage) => {
    const key = (msg.system_key || '').toLowerCase();
    let label = systemLabel(msg);

    const actions: React.ReactNode[] = [];

    // Custom inline inquiry card with image + CTA
    if (key === 'inquiry_sent_v1') {
      let card: any = null;
      try {
        const raw = String((msg as any).content || '');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.inquiry_sent_v1) card = parsed.inquiry_sent_v1;
      } catch {}
      if (card) {
        const isSelf = user?.id && msg.sender_id === user.id;
        const alignClass = isSelf ? 'ml-auto' : 'mr-auto';
        const dateOnly = card.date ? String(card.date).slice(0, 10) : null;
        const prettyDate = (() => {
          if (!dateOnly) return null;
          const d = new Date(dateOnly);
          return isValid(d) ? format(d, 'd LLL yyyy') : dateOnly;
        })();
        return (
          <div className={`my-2 ${alignClass} w-full md:w-1/3 md:max-w-[480px] group relative`} role="group" aria-label="Inquiry sent">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-gray-600 font-medium">{t('system.inquirySent', 'Inquiry sent')}</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900 truncate">{card.title || t('system.listing', 'Listing')}</div>
                </div>
                {card.cover && (
                  <SafeImage src={card.cover} alt="" width={56} height={56} className="ml-auto h-14 w-14 rounded-lg object-cover" sizes="56px" />
                )}
              </div>
              {(prettyDate || card.guests) && (
                <div className="mt-2 text-xs text-gray-600">
                  {[prettyDate, card.guests ? `${card.guests} guest${Number(card.guests) === 1 ? '' : 's'}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}
              {card.view && (
                <div className="mt-3">
                  <a
                    href={card.view}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 hover:text-white hover:no-underline focus:text-white active:text-white"
                  >
                    {t('system.viewListing', 'View listing')}
                  </a>
                </div>
              )}
            </div>
          </div>
        );
      }
    }

    // Receipt download (payment received / receipt available)
    if (key === 'payment_received' || key === 'receipt_available' || key === 'download_receipt' || /\breceipt\b/i.test(label)) {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/+$/,'');
      let url = bookingDetails?.payment_id
        ? `${apiBase}/api/v1/payments/${bookingDetails.payment_id}/receipt`
        : paymentInfo?.receiptUrl || null;
      if (!url && typeof (msg as any).content === 'string') {
        const m = (msg as any).content.match(/(https?:\/\/[^\s]+\/api\/v1\/payments\/[^\s/]+\/receipt|\/?api\/v1\/payments\/[^\s/]+\/receipt)/i);
        if (m) {
          url = m[1].startsWith('http') ? m[1] : `${apiBase}${m[1].startsWith('/') ? '' : '/'}${m[1]}`;
        }
      }
      if (url && !/^https?:\/\//i.test(url)) {
        url = `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
      }
      if (url) {
        actions.push(
          <a
            key="dl-receipt"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-[11px] text-indigo-700 underline hover:text-indigo-800"
          >
            {t('system.downloadReceipt', 'Download receipt')}
          </a>
        );
      }
    }

    // Deposit due / Pay now CTA when there is an unpaid quote
    if (key === 'deposit_due' || /\bdeposit\b/i.test(label)) {
      const accepted = Object.values(quotes).find((q) => q.status === 'accepted');
      const pending = Object.values(quotes).find((q) => q.status === 'pending');
      const qForPay = accepted || pending;
      if (qForPay && isClientViewFlag && !isPaidFlag && !isPaymentOpen) {
        actions.push(
          <Button
            key="pay-now"
            type="button"
            onClick={() => { setIsPaymentOpen(true); openPaymentModal({ bookingRequestId, amount: Number(qForPay.total || 0) } as any); }}
            className="ml-2 !py-0.5 !px-2 !text-[11px]"
          >
            {t('system.payNow', 'Pay now')}
          </Button>
        );
      }
    }

    // Review request CTA
    if (key === 'review_request' && onShowReviewModal) {
      actions.push(
        <Button
          key="leave-review"
          type="button"
          onClick={() => onShowReviewModal(true)}
          className="ml-2 !py-0.5 !px-2 !text-[11px]"
        >
          {t('system.leaveReview', 'Leave review')}
        </Button>
      );
    }

    // Event reminder: compute days left and format label; also handle inline variants
    if (key.startsWith('event_reminder')) {
      let eventDate: Date | undefined;
      const rawDate = (parsedBookingDetails as any)?.date || (bookingDetails as any)?.start_time || undefined;
      if (rawDate) {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) eventDate = d;
      }
      if (eventDate) {
        const today = startOfDay(new Date());
        const days = Math.max(0, differenceInCalendarDays(startOfDay(eventDate), today));
        // Override label with normalized copy when we can compute
        const niceDate = format(eventDate, 'yyyy-MM-dd');
        // Prefer a relative URL as in backend examples
        let calUrl: string | null = null;
        if ((bookingDetails as any)?.id) {
          const bid = (bookingDetails as any).id as number;
          calUrl = `/api/v1/bookings/${bid}/calendar.ics`;
        }
        // Inline label with raw URL instead of a button
        label = calUrl
          ? t(
              'system.eventReminderShortWithCal',
              'Event in {n} days: {date}. Add to calendar: {url}. If not done yet, please finalise event prep.',
              { n: String(days), date: niceDate, url: calUrl }
            )
          : t(
              'system.eventReminderShort',
              'Event in {n} days: {date}. Please finalise event prep.  Add to calendar: {url}.',
              { n: String(days), date: niceDate,  url: calUrl }
            );
      }
    } else {
      // Fallback: detect inline event reminder text even if system_key isn't set as expected
      const raw = String((msg as any).content || '');
      const match = raw.match(/\bEvent\s+in\s+(\d+)\s+days:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})(?:[ T]\d{2}:\d{2})?/i);
      if (match) {
        const n = match[1];
        const d = match[2];
        // Extract calendar URL and include it inline in the label
        let calUrl: string | null = null;
        const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/+$/,'');
        const m = raw.match(/add\s+to\s+calendar:\s*(https?:\/\/\S+|\/\S*)/i);
        if (m) {
          calUrl = /^https?:\/\//i.test(m[1]) ? m[1] : `${apiBase}${m[1].startsWith('/') ? '' : '/'}${m[1]}`;
        }
        label = calUrl
          ? t('system.eventReminderShortWithCal', 'Event in {n} days: {date}. Add to calendar: {url}. If not done yet, please finalise event prep.', { n, date: d, url: calUrl })
          : t('system.eventReminderShort', 'Event in {n} days: {date}. If not done yet, please finalise event prep.', { n, date: d });
      }
    }

    // Detect "View listing: <url>" to surface a clean CTA button
    try {
      const raw = String((msg as any).content || '');
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
      const mView = raw.match(/view\s+listing\s*:\s*(https?:\/\/\S+|\/\S*)/i);
      if (mView) {
        let vurl = mView[1];
        if (!/^https?:\/\//i.test(vurl)) vurl = `${apiBase}${vurl.startsWith('/') ? '' : '/'}${vurl}`;
        actions.push(
          <a
            key="view-listing"
            href={vurl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-[11px] text-indigo-700 underline hover:text-indigo-800"
          >
            {t('system.viewListing', 'View listing')}
          </a>
        );
      }
    } catch {}

    // Remove any inline receipt URL from the label; we surface a clean CTA instead
    const displayLabel = (() => {
      const stripped = String(label || '')
        .replace(/receipt:\s*(https?:\/\/\S+|\/\S*)/gi, '')
        // Keep "Add to calendar" URL for event reminders; strip elsewhere
        [key.startsWith('event_reminder') ? 'replaceAll' : 'replace'](/add\s+to\s+calendar:\s*(https?:\/\/\S+|\/\S*)/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      return stripped || String(label || '').trim();
    })();

    // Centered divider style: lines left/right, text in middle; actions below
    const isBookaModeration = key.startsWith('listing_approved_v1') || key.startsWith('listing_rejected_v1');
    return (
      <div className="my-3">
        {isBookaModeration && (
          <div className="flex items-center justify-center mb-1">
            <span className="inline-flex items-center gap-1 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 text-[10px] font-semibold">
              Booka
            </span>
          </div>
        )}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <div className="h-px bg-gray-200 flex-1" />
          <span className="px-2 bg-white text-gray-600 max-w-[75%] text-center break-words">
            {displayLabel}
          </span>
          <div className="h-px bg-gray-200 flex-1" />
        </div>
        {actions.length > 0 && (
          <div className="mt-2 flex items-center justify-center gap-2">
            {actions}
          </div>
        )}
      </div>
    );
  }, [bookingDetails, paymentInfo, quotes, isClientViewFlag, isPaidFlag, isPaymentOpen, openPaymentModal, bookingRequestId, onShowReviewModal, parsedBookingDetails]);

  // ---- Reactions helpers (persisted)
  const toggleReaction = useCallback(async (msgId: number, emoji: string) => {
    // compute has from latest myReactions snapshot
    const hasNow = (myReactions[msgId] || new Set<string>()).has(emoji);

    // optimistic: compute from latest state snapshots safely using functional updates
    let committedCounts: Record<string, number> = {};
    setReactions((prev) => {
      const msgSnapshot = messages.find((m) => m.id === msgId);
      const merged = {
        ...((prev[msgId] as any) || {}),
        ...(((msgSnapshot?.reactions as any) || {}) as Record<string, number>),
      } as Record<string, number>;
      const updated = { ...merged, [emoji]: Math.max(0, (merged[emoji] || 0) + (hasNow ? -1 : 1)) };
      committedCounts = updated;
      return { ...prev, [msgId]: updated };
    });
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, reactions: committedCounts } : m)));
    setMyReactions((m) => {
      const copy = new Set(m[msgId] || []) as Set<string>;
      if (hasNow) copy.delete(emoji); else copy.add(emoji);
      return { ...m, [msgId]: copy };
    });

    try {
      if (hasNow) await removeMessageReaction(bookingRequestId, msgId, emoji);
      else await addMessageReaction(bookingRequestId, msgId, emoji);
    } catch {
      // keep optimistic
    }
  }, [bookingRequestId, myReactions, messages]);

  const ReactionBar: React.FC<{ id: number }> = ({ id }) => {
    const opts = ['👍','❤️','😂','🎉','👏','🔥'];
    return (
      <div className="mt-1 inline-flex gap-1.5 rounded-full bg-white border border-gray-200 px-2 py-1 shadow">
        {opts.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => { toggleReaction(id, e); setReactionPickerFor(null); setActionMenuFor(null); }}
            className="text-sm rounded-full hover:bg-gray-100 px-3 py-1"
          >
            {e}
          </button>
        ))}
      </div>
    );
  };

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
      if (!newMessageContent.trim() && !attachmentFile && imageFiles.length === 0) return;

      if ((attachmentFile || imageFiles.length > 0) && !navigator.onLine) {
        setThreadError('Cannot send attachments while offline.');
        return;
      }

      let attachment_url: string | undefined;
      const tempId = -Date.now(); // negative to avoid collisions

      try {
        if (imageFiles.length > 0) {
          // Upload and send multiple images. First image carries the text if provided.
          setIsUploadingAttachment(true);
          const uploadedUrls: string[] = [];
          for (let i = 0; i < imageFiles.length; i++) {
            const f = imageFiles[i];
            const res = await uploadMessageAttachment(
              bookingRequestId,
              f,
              (evt) => {
                if (evt.total) setUploadingProgress(Math.round((evt.loaded * 100) / evt.total));
              },
            );
            uploadedUrls.push(res.data.url);
          }

          // Send first image with text (or placeholder hidden later)
          const firstUrl = uploadedUrls[0];
          let baseContent = newMessageContent;
          if (!baseContent.trim()) baseContent = '[Attachment]';
          const firstPayload: MessageCreate = { content: baseContent, attachment_url: firstUrl } as any;

          // Optimistic for first
          const firstOptimistic: ThreadMessage = {
            id: tempId,
            booking_request_id: bookingRequestId,
            sender_id: user?.id || 0,
            sender_type: user?.user_type === 'service_provider' ? 'service_provider' : 'client',
            content: baseContent,
            message_type: 'USER',
            quote_id: null,
            attachment_url: firstUrl,
            visible_to: 'both',
            action: null,
            avatar_url: undefined,
            expires_at: null,
            unread: false,
            is_read: true,
            timestamp: gmt2ISOString(),
            status: 'sending',
            reply_to_message_id: replyTarget?.id ?? null,
            reply_to_preview: replyTarget ? replyTarget.content.slice(0, 120) : null,
          };
          setMessages((prev) => mergeMessages(prev, firstOptimistic));

          try {
            const res = await postMessageToBookingRequest(bookingRequestId, firstPayload);
            setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...normalizeMessage(res.data), status: 'sent' } : m)));
          } catch (err) {
            console.error('Failed to send first image message:', err);
            setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'queued' as const } : m)));
            enqueueMessage({ tempId, payload: firstPayload });
          }

          // Send remaining images as individual messages with hidden placeholder
          for (let i = 1; i < uploadedUrls.length; i++) {
            const url = uploadedUrls[i];
            const payload: MessageCreate = { content: '[Attachment]', attachment_url: url } as any;
            const temp = tempId - (i + 1);
            const optimistic: ThreadMessage = {
              ...firstOptimistic,
              id: temp,
              content: '[Attachment]',
              attachment_url: url,
              reply_to_message_id: null,
              reply_to_preview: null,
            };
            setMessages((prev) => mergeMessages(prev, optimistic));
            try {
              const res = await postMessageToBookingRequest(bookingRequestId, payload);
              setMessages((prev) => prev.map((m) => (m.id === temp ? { ...normalizeMessage(res.data), status: 'sent' } : m)));
            } catch (err) {
              console.error('Failed to send image message:', err);
              setMessages((prev) => prev.map((m) => (m.id === temp ? { ...m, status: 'queued' as const } : m)));
              enqueueMessage({ tempId: temp, payload });
            }
          }

          // Reset inputs
          setNewMessageContent('');
          setImageFiles([]);
          try { imagePreviewUrls.forEach((u) => URL.revokeObjectURL(u)); } catch {}
          setImagePreviewUrls([]);
          setUploadingProgress(0);
          setIsUploadingAttachment(false);
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.rows = 1;
            textareaRef.current.focus();
          }
          setReplyTarget(null);
          onMessageSent?.();
          return;
        }

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

        // If sending an attachment without text, label with filename and size for non-images
        let baseContent = newMessageContent;
        if (!baseContent.trim() && attachment_url) {
          const isImg = !!attachmentFile && attachmentFile.type.startsWith('image/');
          if (!isImg && attachmentFile) {
            baseContent = `${attachmentFile.name} (${formatBytes(attachmentFile.size)})`;
          } else {
            // fallback (shouldn't hit because images go via imageFiles)
            baseContent = '[Attachment]';
          }
        }
        const payload: MessageCreate = {
          content: baseContent,
          attachment_url,
        };
        if (replyTarget?.id) payload.reply_to_message_id = replyTarget.id;

        // Optimistic
        const optimistic: ThreadMessage = {
          id: tempId,
          booking_request_id: bookingRequestId,
          sender_id: user?.id || 0,
          sender_type: user?.user_type === 'service_provider' ? 'service_provider' : 'client',
          content: baseContent,
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
          reply_to_message_id: replyTarget?.id ?? null,
          reply_to_preview: replyTarget ? replyTarget.content.slice(0, 120) : null,
        };
        setMessages((prev) => mergeMessages(prev, optimistic));

        const resetInput = () => {
          setNewMessageContent('');
          setAttachmentFile(null);
          setAttachmentPreviewUrl(null);
          setImageFiles([]);
          try { imagePreviewUrls.forEach((u) => URL.revokeObjectURL(u)); } catch {}
          setImagePreviewUrls([]);
          setUploadingProgress(0);
          setIsUploadingAttachment(false);
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.rows = 1;
            textareaRef.current.focus();
          }
          setReplyTarget(null);
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
        // No drawer — QuoteBubble modal presents details via "View quote".
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

  // Emit booking context for header menus (additive, safe)
  useEffect(() => {
    const accepted = Object.values(quotes).find((q: any) => q?.status === 'accepted' && q?.booking_id);
    const bid = (bookingDetails as any)?.id || (accepted as any)?.booking_id || null;
    try { (window as any).__currentBookingId = bid; } catch {}
    try { window.dispatchEvent(new Event('booking:context')); } catch {}
    return () => {
      try { (window as any).__currentBookingId = null; } catch {}
      try { window.dispatchEvent(new Event('booking:context')); } catch {}
    };
  }, [bookingDetails?.id, quotes]);

  // Collapsible state for Event Prep card
  const [eventPrepCollapsed, setEventPrepCollapsed] = useState(true);

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

  // Keep last message visible by padding the scroll area with the composer height
  // Keep a minimal visual gap; do not pad by composer height
  const effectiveBottomPadding = `calc(${BOTTOM_GAP_PX}px + env(safe-area-inset-bottom))`;

  // When the composer height changes and the user is anchored at bottom, keep the view pinned
  // On composer height changes, if anchored, shift by the exact composer delta
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const anchored = distanceFromBottomRef.current <= MIN_SCROLL_OFFSET;
    const deltaH = composerHeight - (prevComposerHeightRef.current || 0);
    if (anchored && deltaH !== 0) {
      // Move content up by the same amount the composer grew
      el.scrollTop = Math.max(0, el.scrollTop + deltaH);
    }
    prevComposerHeightRef.current = composerHeight;
    // Recompute distance from bottom after adjustments
    distanceFromBottomRef.current = el.scrollHeight - (el.scrollTop + el.clientHeight);
  }, [composerHeight]);

  // ===== Render ===============================================================
  return (
    <div ref={wrapperRef} className="relative flex flex-col rounded-b-2xl overflow-hidden w-full bg-white h-full min-h-0">
      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        onTouchStart={handleTouchStartOnList}
        onTouchMove={handleTouchMoveOnList}
        onWheel={handleWheelOnList}
        className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-3 bg-white px-3 pt-3"
        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', paddingBottom: effectiveBottomPadding }}
      >
        {!loading && (
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

        {user?.user_type === 'service_provider' && !bookingConfirmed && !hasSentQuote && !isPersonalizedVideo && !!bookingRequest && !isModerationThread && !isInquiryThread && (
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
                            <SafeImage
                              src={clientAvatarUrl}
                              alt="Client avatar"
                              width={20}
                              height={20}
                              className="h-5 w-5 rounded-full object-cover mr-2"
                            />
                          )
                        : (
                            <div className="h-5 w-5 rounded-full bg-gray-300 flex items-center justify-center text-[10px] font-medium mr-2">
                              {clientName?.charAt(0)}
                            </div>
                          )
                      : artistAvatarUrl
                        ? (
                            <SafeImage
                              src={artistAvatarUrl}
                              alt="Service Provider avatar"
                              width={20}
                              height={20}
                              className="h-5 w-5 rounded-full object-cover mr-2"
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

                  const isSystemMsg = isSystemMsgHelper(msg);

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

                  // Detect inline inquiry card payload even if message_type is not SYSTEM
                  try {
                    const raw = String((msg as any).content || '');
                    if (raw.startsWith('{') && raw.includes('inquiry_sent_v1')) {
                      const parsed = JSON.parse(raw);
                      const card = parsed?.inquiry_sent_v1;
                      if (card) {
                        const alignClass = isMsgFromSelf ? 'ml-auto' : 'mr-auto';
                        const dateOnly = card.date ? String(card.date).slice(0, 10) : null;
                        const prettyDate = (() => {
                          if (!dateOnly) return null;
                          const d = new Date(dateOnly);
                          return isValid(d) ? format(d, 'd LLL yyyy') : dateOnly;
                        })();
                        return (
                          <div key={msg.id} className={`my-2 ${alignClass} w-full md:w-1/3 md:max-w-[480px] group relative`} role="group" aria-label="Inquiry sent">
                            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3">
                              <div className="flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="text-[11px] text-gray-600 font-medium">{t('system.inquirySent', 'Inquiry sent')}</div>
                                  <div className="mt-1 text-sm font-semibold text-gray-900 truncate">{card.title || t('system.listing', 'Listing')}</div>
                                </div>
                                {card.cover && (
                                  <SafeImage src={card.cover} alt="" width={56} height={56} className="ml-auto h-14 w-14 rounded-lg object-cover" sizes="56px" />
                                )}
                              </div>
                              {(prettyDate || card.guests) && (
                                <div className="mt-2 text-xs text-gray-600">
                                  {[prettyDate, card.guests ? `${card.guests} guest${Number(card.guests) === 1 ? '' : 's'}` : null]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </div>
                              )}
                              {card.view && (
                                <div className="mt-3">
                                  <a
                                    href={card.view}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex w-full items-center justify-center rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 hover:text-white hover:no-underline focus:text-white active:text-white"
                                  >
                                    {t('system.viewListing', 'View listing')}
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }
                    }
                  } catch {}

                  // Plain system line (except for special actions handled below)
                  if (isSystemMsg && msg.action !== 'view_booking_details' && msg.action !== 'review_quote') {
                    return (
                      <div key={msg.id} ref={idx === firstUnreadIndex && msgIdx === 0 ? firstUnreadMessageRef : null}>
                        {renderSystemLine(msg)}
                      </div>
                    );
                  }

                  const bubbleBase = isMsgFromSelf
                    ? 'bg-blue-50 text-gray-900 whitespace-pre-wrap break-words'
                    : 'bg-gray-50 text-gray-900 whitespace-pre-wrap break-words';
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
                          onViewDetails={undefined}
                          onAskQuestion={() => textareaRef.current?.focus()}
                          onAccept={undefined}
                          onPayNow={
                            user?.user_type === 'client' && (quoteData.status === 'pending' || quoteData.status === 'accepted') && !isPaid && !isPaymentOpen
                              ? async () => {
                                  try {
                                    if (quoteData.status === 'pending') {
                                      await handleAcceptQuote(quoteData);
                                    }
                                  } catch (e) {
                                    // If acceptance fails, surface error and abort payment
                                    console.error('Failed to accept before pay:', e);
                                    setThreadError('Could not accept the quote. Please try again.');
                                    return;
                                  }
                                  setIsPaymentOpen(true);
                                  openPaymentModal({ bookingRequestId, amount: Number(quoteData.total || 0) } as any);
                                }
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
                                    {t('quote.guidance.acceptCta', 'Ready to go? Tap Pay now to confirm your booking.')}
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

                  if (isSystemMsg && (msg.action === 'review_quote' || msg.action === 'view_booking_details')) {
                    return null;
                  }

                  // Reveal images lazily
                  const [revealedImages, setRevealedImages] = [undefined, undefined] as any;

                  const reactionMapForMsg = ((reactions[msg.id] || (msg.reactions as any) || {}) as Record<string, number>);
                  const hasReactionsForMsg = Object.entries(reactionMapForMsg).some(([, c]) => (Number(c) > 0));

                  return (
                    <div
                      key={msg.id}
                      id={`msg-${msg.id}`}
                      className={`group relative inline-block select-none w-auto max-w-[75%] ${isImageAttachment(msg.attachment_url || undefined) ? 'p-0 bg-transparent rounded-xl' : 'px-3 py-2'} text-[13px] leading-snug ${bubbleClasses} ${isImageAttachment(msg.attachment_url || undefined) ? 'bg-transparent' : ''} ${hasReactionsForMsg ? 'mb-5' : (msgIdx < group.messages.length - 1 ? 'mb-0.5' : '')} ${isMsgFromSelf ? 'ml-auto mr-0' : 'mr-auto ml-0'} ${highlightFor === msg.id ? 'ring-1 ring-indigo-200' : ''}`}
                      ref={idx === firstUnreadIndex && msgIdx === 0 ? firstUnreadMessageRef : null}
                      onTouchStart={(e) => startLongPress(msg.id, e)}
                      onTouchMove={moveLongPress}
                      onTouchEnd={endLongPress}
                      onTouchCancel={(e) => endLongPress(e)}
                      style={{ WebkitTouchCallout: 'none' } as any}
                    >
                      {/* Desktop hover extender zones: make hover area span full row side */}
                      {isMsgFromSelf ? (
                        <div className="hidden md:block absolute inset-y-0 left-0 -translate-x-full w-screen" aria-hidden="true" />
                      ) : (
                        <div className="hidden md:block absolute inset-y-0 right-0 translate-x-full w-screen" aria-hidden="true" />
                      )}
                      <div className={isImageAttachment(msg.attachment_url || undefined) ? '' : 'pr-9'}>
                        {msg.reply_to_preview && (
                          <button
                            type="button"
                            onClick={() =>
                              msg.reply_to_message_id &&
                              scrollToMessage(msg.reply_to_message_id)
                            }
                            className="mb-1 w-full rounded bg-gray-200 text-left text-[12px] text-gray-700 px-2 py-1 border-l-2  border-gray-800 cursor-pointer "
                            title="View replied message"
                          >
                            <span className="line-clamp-2 break-words">
                              {msg.reply_to_preview}
                            </span>
                          </button>
                        )}
                        {!isMsgFromSelf && !msg.is_read && (
                          <span className="" aria-label="Unread message" />
                        )}

                        {
                          <>
                            {(() => {
                              // Suppress placeholder labels; style non-image attachments like a reply header box
                              const url = msg.attachment_url ? (getFullImageUrl(msg.attachment_url) as string) : '';
                              const isAudio = /\.(webm|mp3|m4a|ogg)$/i.test(url);
                              const isImage = isImageAttachment(msg.attachment_url || undefined);
                              const contentLower = String(msg.content || '').trim().toLowerCase();
                              const isVoicePlaceholder = contentLower === '[voice note]';
                              const isAttachmentPlaceholder = contentLower === '[attachment]';
                              if (isAudio && isVoicePlaceholder) return null; // legacy voice-note placeholder hidden
                              if (isImage && isAttachmentPlaceholder) return null; // hide generic attachment label for images
                              // For non-image attachments, render a reply-style header with file label; no text body below
                              if (!isImage && msg.attachment_url) {
                                let label = String(msg.content || '').trim();
                                if (!label || isAttachmentPlaceholder) {
                                  try {
                                    label = decodeURIComponent((url.split('?')[0].split('/').pop() || 'Attachment'));
                                  } catch {
                                    label = 'Attachment';
                                  }
                                }
                                // Pick an icon by extension
                                let IconComp: React.ComponentType<React.SVGProps<SVGSVGElement>> | null = DocumentTextIcon;
                                try {
                                  const clean = url.split('?')[0];
                                  const ext = (clean.split('.').pop() || '').toLowerCase();
                                  if (['mp3','m4a','ogg','webm','wav'].includes(ext)) IconComp = MusicalNoteIcon;
                                  else if (ext === 'pdf') IconComp = DocumentIcon;
                                  else if (['doc','docx','txt','rtf','ppt','pptx','xls','xlsx','csv','md'].includes(ext)) IconComp = DocumentTextIcon;
                                  else IconComp = PaperClipIcon;
                                } catch { IconComp = DocumentTextIcon; }
                                return (
                                  <div
                                    className={`mb-3 w-full rounded bg-gray-200 text-left text-[12px] text-gray-700 px-2 py-1 ${!isAudio ? 'cursor-pointer' : ''}`}
                                    title={label}
                                    role={!isAudio ? 'button' : undefined}
                                    tabIndex={!isAudio ? 0 : undefined}
                                    onClick={!isAudio ? (e) => { e.stopPropagation(); setFilePreviewSrc(toProxyPath(url)); } : undefined}
                                    onKeyDown={!isAudio ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFilePreviewSrc(toProxyPath(url)); } } : undefined}
                                  >
                                    <span className="inline-flex items-center gap-1.5">
                                      {IconComp ? <IconComp className="w-3.5 h-3.5 text-gray-600" /> : null}
                                      <span className="line-clamp-2 break-words">{label}</span>
                                    </span>
                                  </div>
                                );
                              }
                              return msg.content;
                            })()}
                            {msg.attachment_url && (
                              (() => {
                                const url = getFullImageUrl(msg.attachment_url) as string;
                                const isAudio = /\.(webm|mp3|m4a|ogg)$/i.test(url);
                                if (isImageAttachment(msg.attachment_url)) {
                                  return (
                                    <div className="relative mt-0 inline-block w-full">
                                      <button
                                        type="button"
                                        onClick={() => openImageModalForUrl(url)}
                                        className="block"
                                        aria-label="Open image"
                                      >
                                        <Image
                                          src={url}
                                          alt="Image attachment"
                                          width={600}
                                          height={600}
                                          loading="lazy"
                                          className="block w-full h-auto rounded-xl"
                                        />
                                      </button>
                                    </div>
                                  );
                                }
                                if (isAudio) {
                                  return (
                                    <div className="mt-1 inline-block">
                                      <audio
                                        className="w-56 cursor-pointer"
                                        controls
                                        src={url}
                                        preload="metadata"
                                        onClick={(e) => { e.stopPropagation(); setFilePreviewSrc(toProxyPath(url)); }}
                                      />
                                    </div>
                                  );
                                }
                                return null; // header is the clickable element for non-image, non-audio files
                              })()
                            )}
                          </>
                        }
                      </div>

                      {/* Time & status */}
                      <div className={`absolute bottom-0.5 right-1.5 flex items-center space-x-0.5 text-[10px] text-right ${isImageAttachment(msg.attachment_url || undefined) ? 'text-white' : 'text-gray-500'}`}>
                        <span className={`${isImageAttachment(msg.attachment_url || undefined) ? 'bg-black/40 rounded px-1.5 py-0.5' : ''}`}>
                          <time dateTime={msg.timestamp} title={new Date(msg.timestamp).toLocaleString()}>
                            {format(new Date(msg.timestamp), 'HH:mm')}
                          </time>
                        </span>
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

                    {/* Hover controls (hide on SYSTEM messages) */}
                    {normalizeType(msg.message_type) !== 'SYSTEM' && (
                      <>
                        {/* Reaction shortcut per spec:
                            - Sender (right-aligned bubbles): reaction on LEFT
                            - Receiver (left-aligned bubbles): reaction on RIGHT */}
                        <button
                          type="button"
                          title="React"
                          className={`hidden sm:flex absolute top-1/2 -translate-y-1/2 ${
                            isMsgFromSelf
                              ? (isImageAttachment(msg.attachment_url || undefined) ? '-left-8' : '-left-7')
                              : (isImageAttachment(msg.attachment_url || undefined) ? '-right-8' : '-right-7')
                          } opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity w-7 h-7 rounded-full ${
                            isImageAttachment(msg.attachment_url || undefined) ? 'bg-white/90' : 'bg-white/80'
                          } hover:bg-white text-gray-700 shadow flex items-center justify-center`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionMenuFor(null);
                            setReactionPickerFor((v) => (v === msg.id ? null : msg.id));
                          }}
                        >
                          <FaceSmileIcon className="w-4 h-4" />
                        </button>

                        {/* Chevron + actions container; hidden until hover (like emoji button) */}
                        {(() => {
                          const hasAttachment = Boolean(msg.attachment_url);
                          const hasReply = Boolean(msg.reply_to_preview);
                          const content = msg.content || '';
                          const isLikelyOneLine = !hasAttachment && !hasReply && !content.includes('\n') && content.length <= 36;
                          const chevronPos = isLikelyOneLine ? 'bottom-4 right-1' : 'top-1 right-1';
                          return (
                            <div className={`absolute ${chevronPos} opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity`}>
                              <button
                                type="button"
                                title="More"
                                className="w-5 h-5 rounded-md bg-white border border-gray-200 text-gray-700 shadow-sm flex items-center justify-center hover:bg-gray-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReactionPickerFor(null);
                                  setActionMenuFor((v) => (v === msg.id ? null : msg.id));
                                }}
                              >
                                <ChevronDownIcon className="w-3 h-3" />
                              </button>
                              {actionMenuFor === msg.id && !(isMobile && !isMsgFromSelf) && (
                                <div
                                  ref={actionMenuRef}
                                  className={`absolute bottom-full ${isMsgFromSelf ? 'right-0' : 'left-0'} z-20 min-w-[160px] rounded-md border border-gray-200 bg-white shadow-lg`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    className="block w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50"
                                    onClick={() => {
                                      try {
                                        const parts: string[] = [];
                                        if (msg.content) parts.push(msg.content);
                                        if (msg.attachment_url) parts.push(getFullImageUrl(msg.attachment_url) as string);
                                        void navigator.clipboard.writeText(parts.join('\n'));
                                      } catch (e) {
                                        console.error('Copy failed', e);
                                      } finally {
                                        setActionMenuFor(null);
                                        setCopiedFor(msg.id);
                                        setHighlightFor(msg.id);
                                        setTimeout(() => {
                                          setCopiedFor((v) => (v === msg.id ? null : v));
                                          setHighlightFor((v) => (v === msg.id ? null : v));
                                        }, 1200);
                                      }
                                    }}
                                  >
                                    Copy
                                  </button>
                                  <button
                                    type="button"
                                    className="block w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50"
                                    onClick={() => {
                                      setReplyTarget(msg);
                                      setReactionPickerFor(null);
                                      setActionMenuFor(null);
                                    }}
                                  >
                                    Reply
                                  </button>
                                  <button
                                    type="button"
                                    className="block w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50"
                                    onClick={() => {
                                      setActionMenuFor(null);
                                      setReactionPickerFor(msg.id);
                                    }}
                                  >
                                    React
                                  </button>
                                  {msg.attachment_url && (
                                    <button
                                      type="button"
                                      className="block w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50"
                                      onClick={async () => {
                                        try {
                                          const url = getFullImageUrl(msg.attachment_url!) as string;
                                          const res = await fetch(url, { credentials: 'include' as RequestCredentials });
                                          if (!res.ok) throw new Error(String(res.status));
                                          const blob = await res.blob();
                                          const a = document.createElement('a');
                                          const objectUrl = URL.createObjectURL(blob);
                                          a.href = objectUrl;
                                          a.download = url.split('/').pop() || 'file';
                                          document.body.appendChild(a);
                                          a.click();
                                          a.remove();
                                          URL.revokeObjectURL(objectUrl);
                                        } catch (err) {
                                          try { window.open(getFullImageUrl(msg.attachment_url!) as string, '_blank', 'noopener,noreferrer'); } catch {}
                                        } finally {
                                          setActionMenuFor(null);
                                        }
                                      }}
                                    >
                                      Download
                                    </button>
                                  )}
                                  {isMsgFromSelf && (
                                    <button
                                      type="button"
                                      className="block w-full text-left px-3 py-2 text-[12px] text-red-600 hover:bg-red-50"
                                      onClick={async () => {
                                        setActionMenuFor(null);
                                        const ok = typeof window !== 'undefined' ? window.confirm('Delete this message?') : true;
                                        if (!ok) return;
                                        const snapshot = messages;
                                        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                                        try {
                                          const bid = bookingDetails?.id || (parsedBookingDetails as any)?.id;
                                          if (bid) await deleteMessageForBookingRequest(bookingRequestId, msg.id);
                                        } catch (e) {
                                          setMessages(snapshot);
                                          console.error('Delete failed', e);
                                          alert('Could not delete this message.');
                                        }
                                      }}
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </>
                    )}

                    {/* Reaction picker */}
                    {reactionPickerFor === msg.id && (
                      <>
                        {/* Desktop/Tablet anchored picker */}
                        <div
                          ref={reactionPickerRefDesktop}
                          className={`hidden sm:block absolute -top-10 z-30 pointer-events-auto ${
                            isMsgFromSelf ? 'left-1/2 transform -translate-x-full' : 'left-1/2'
                          }`}
                        >
                          <ReactionBar id={msg.id} />
                        </div>
                      </>
                    )}

                    {/* Reactions badge: bottom-left of bubble for both sender and receiver.
                        Sits half inside, half outside the bubble for emphasis. */}
                    {(Object.entries(reactionMapForMsg).some(([, c]) => Number(c) > 0)) && (
                      <div className="absolute left-2 -bottom-3 z-20">
                        <div className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 shadow-sm">
                          {Object.entries(reactionMapForMsg)
                            .filter(([, c]) => Number(c) > 0)
                            .map(([k, c]) => (
                              <span key={k} className="leading-none">
                                {k} {c}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            </React.Fragment>
          );
        })}

        {typingIndicator && <p className="text-xs text-gray-500" aria-live="polite">{typingIndicator}</p>}

        {/* messagesEnd anchor */}
        
        <div ref={messagesEndRef} className="absolute bottom-0 left-0 w-0 h-0" aria-hidden="true" />
      </div>

      {/* No skeleton or spinner per request */}

      {/* Mobile reaction overlay: global scrim + centered picker */}
      {reactionPickerFor !== null && actionMenuFor === null && isMobile && (
        <div className="sm:hidden fixed inset-0 z-[2000]">
          <button
            type="button"
            aria-label="Close reactions"
            className="absolute inset-0 bg-black/30"
            onClick={() => setReactionPickerFor(null)}
          />
          <div className="relative w-full h-full flex items-center justify-center">
            <div ref={reactionPickerRefMobile}>
              <ReactionBar id={reactionPickerFor} />
            </div>
          </div>
        </div>
      )}

      {/* Mobile overlay: dim screen; center received actions; show reactions above */}
      {actionMenuFor !== null && isMobile && (
        <div className="fixed inset-0 z-[2000] sm:hidden">
          <button
            type="button"
            aria-label="Close actions"
            className="absolute inset-0 bg-white/70 backdrop-blur-sm z-[2001]"
            onClick={() => { setActionMenuFor(null); setReactionPickerFor(null); }}
          />
          {(() => {
            const msg = messages.find((m) => m.id === actionMenuFor);
            const isFromSelf = msg ? (msg.sender_id === (user?.id || 0)) : false;
            return (
              <div className="relative w-full h-full flex items-center justify-center px-6 pointer-events-none">
                <div className="w-full max-w-sm flex flex-col items-stretch gap-3 z-[2002] pointer-events-auto">
                  {/* Reactions row on top for mobile */}
                  {reactionPickerFor !== null && (
                    <div ref={reactionPickerRefMobile} className="flex items-center justify-center">
                      <ReactionBar id={reactionPickerFor} />
                    </div>
                  )}
                  {/* Target message preview */}
                  {msg && (
                    <div className="w-full">
                      {(() => {
                        const bubbleBase = isFromSelf ? 'bg-blue-50 text-gray-900 whitespace-pre-wrap break-words' : 'bg-gray-50 text-gray-900 whitespace-pre-wrap break-words';
                        const bubbleClasses = `${bubbleBase} rounded-xl`;
                        const isImg = isImageAttachment(msg.attachment_url || undefined);
                        return (
                          <div className={`px-3 py-2 text-[13px] leading-snug ${bubbleClasses}`}>
                            {isImg ? (
                              <span>Image</span>
                            ) : (
                              <span className="block max-h-24 overflow-hidden">{msg.content}</span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {/* Actions list for both sent and received */}
                  {msg && (
                    <div ref={actionMenuRef} className="rounded-md border border-gray-200 bg-white shadow-lg">
                      <button
                        type="button"
                        className="block w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50"
                        onClick={() => {
                          try {
                            const parts: string[] = [];
                            if (msg.content) parts.push(msg.content);
                            if (msg.attachment_url) parts.push(getFullImageUrl(msg.attachment_url) as string);
                            void navigator.clipboard.writeText(parts.join('\n'));
                          } catch (e) {
                            console.error('Copy failed', e);
                          } finally {
                            setActionMenuFor(null);
                            setCopiedFor(msg.id);
                            setTimeout(() => setCopiedFor((v) => (v === msg.id ? null : v)), 1200);
                          }
                        }}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className="block w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50"
                        onClick={() => {
                          setReplyTarget(msg);
                          setReactionPickerFor(null);
                          setActionMenuFor(null);
                        }}
                      >
                        Reply
                      </button>
                      <button
                        type="button"
                        className="block w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50"
                        onClick={() => {
                          setReactionPickerFor(msg.id);
                        }}
                      >
                        React
                      </button>
                      {msg.attachment_url && (
                        <button
                          type="button"
                          className="block w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50"
                          onClick={async () => {
                            try {
                              const url = getFullImageUrl(msg.attachment_url!) as string;
                              const res = await fetch(url, { credentials: 'include' as RequestCredentials });
                              if (!res.ok) throw new Error(String(res.status));
                              const blob = await res.blob();
                              const a = document.createElement('a');
                              const objectUrl = URL.createObjectURL(blob);
                              a.href = objectUrl;
                              a.download = url.split('/').pop() || 'file';
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                              URL.revokeObjectURL(objectUrl);
                            } catch (err) {
                              try { window.open(getFullImageUrl(msg.attachment_url!) as string, '_blank', 'noopener,noreferrer'); } catch {}
                            } finally {
                              setActionMenuFor(null);
                            }
                          }}
                        >
                          Download
                        </button>
                      )}
                      {isFromSelf && (
                        <button
                          type="button"
                          className="block w-full text-left px-3 py-2 text-[12px] text-red-600 hover:bg-red-50"
                          onClick={async () => {
                            setActionMenuFor(null);
                            const ok = typeof window !== 'undefined' ? window.confirm('Delete this message?') : true;
                            if (!ok) return;
                            const snapshot = messages;
                            setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                            try {
                              const bid = bookingDetails?.id || (parsedBookingDetails as any)?.id;
                              if (bid) await deleteMessageForBookingRequest(bookingRequestId, msg.id);
                            } catch (e) {
                              setMessages(snapshot);
                              console.error('Delete failed', e);
                              alert('Could not delete this message.');
                            }
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}


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
                // Adapt UI to service type in modal
                showTravel={!isPersonalizedVideo}
                showSound={!isPersonalizedVideo}
                showPolicy={!isPersonalizedVideo}
                showEventDetails={!isPersonalizedVideo}
                showReceiptBelowTotal={isPersonalizedVideo}
              />
            </div>
          </div>
        ),
        document.body
      )}

      {/* Attachment preview — hide on mobile while details panel open */}
      {/* Image previews row (multiple) */}
      {imagePreviewUrls.length > 0 && (
        <div className={isDetailsPanelOpen ? 'hidden md:flex items-center gap-2 mb-1 bg-gray-100 rounded-xl p-2 shadow-inner' : 'flex items-center gap-2 mb-1 bg-gray-100 rounded-xl p-2 shadow-inner'}>
          {/* Add more images button on the left */}
          <input id="image-upload" type="file" accept="image/*" multiple className="hidden" onChange={(e) => addImageFiles(Array.from(e.target.files || []))} />
          <label htmlFor="image-upload" className="flex-shrink-0 w-10 h-10 rounded-md border border-dashed border-gray-300 bg-white/70 text-gray-600 flex items-center justify-center cursor-pointer hover:bg-white" title="Add images">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </label>
          <div className="flex items-center gap-2 overflow-x-auto">
            {imagePreviewUrls.map((u, i) => (
              <div key={i} className="relative w-16 h-16 rounded-md overflow-hidden border border-gray-200 bg-white">
                <Image src={u} alt={`Preview ${i+1}`} width={64} height={64} className="w-16 h-16 object-cover" unoptimized />
                <button type="button" aria-label="Remove image" className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 border border-gray-200 text-gray-700 flex items-center justify-center hover:bg-white" onClick={() => removeImageAt(i)}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Non-image attachment preview */}
      {attachmentPreviewUrl && attachmentFile && !attachmentFile.type.startsWith('image/') && (
        <div className={isDetailsPanelOpen ? 'hidden md:flex items-center gap-2 mb-1 bg-gray-100 rounded-xl p-2 shadow-inner' : 'flex items-center gap-2 mb-1 bg-gray-100 rounded-xl p-2 shadow-inner'}>
          {attachmentFile && (attachmentFile.type.startsWith('audio/') || /\.(webm|mp3|m4a|ogg)$/i.test(attachmentFile.name || '')) ? (
            <>
              <audio className="w-48" controls src={attachmentPreviewUrl} preload="metadata" />
              <span className="text-xs text-gray-700 font-medium">{attachmentFile.name} ({formatBytes(attachmentFile.size)})</span>
            </>
          ) : (
            <>
              {attachmentFile?.type === 'application/pdf' ? (
                <DocumentIcon className="w-8 h-8 text-red-600" />)
                : (<DocumentTextIcon className="w-8 h-8 text-gray-600" />)}
              <span className="text-xs text-gray-700 font-medium">{attachmentFile?.name} ({formatBytes(attachmentFile.size)})</span>
            </>
          )}
          <button type="button" onClick={() => setAttachmentFile(null)} className="text-xs text-red-600 hover:text-red-700 font-medium" aria-label="Remove attachment">Remove</button>
        </div>
      )}

      {/* Composer — hidden on mobile while details panel is open, or entirely when disabled */}
      {user && !disableComposer && (
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
            {/* Event Prep: show as a bottom bar above the composer, always in view */}
            {(() => {
              const accepted = Object.values(quotes).find((q: any) => q?.status === 'accepted' && q?.booking_id);
              const bookingIdForPrep = (bookingDetails as any)?.id || (accepted as any)?.booking_id || null;
              // Show Event Prep whenever a booking exists (accepted quote created a booking),
              // do not gate on env flag to ensure it’s visible.
              return Boolean(bookingIdForPrep);
            })() && (
              <div className="px-2 pt-2 border-b border-gray-100 bg-white">
                <EventPrepCard
                  bookingId={(bookingDetails as any)?.id || (Object.values(quotes).find((q: any) => q?.status === 'accepted' && q?.booking_id) as any)?.booking_id}
                  bookingRequestId={bookingRequestId}
                  eventDateISO={(bookingDetails as any)?.start_time || (parsedBookingDetails as any)?.date}
                  canEdit={Boolean(user)}
                  onContinuePrep={(id) => router.push(`/dashboard/events/${id}`)}
                  summaryOnly
                />
              </div>
            )}
            {showEmojiPicker && (
              <div ref={emojiPickerRef} className="absolute bottom-12 left-0 z-50">
                <EmojiPicker data={data} onEmojiSelect={handleEmojiSelect} previewPosition="none" />
              </div>
            )}

            {/* Reply preview row (full width, single line) */}
            {replyTarget && (
              <div className="px-2 pt-1">
                <div className="w-full rounded-md bg-gray-50 border border-gray-200 px-2 py-1 text-[12px] text-gray-700 flex items-center justify-between">
                  <div className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                    Replying to {replyTarget.sender_type === 'client' ? 'Client' : 'You'}: <span className="italic text-gray-500">{replyTarget.content}</span>
                  </div>
                  <button type="button" className="ml-2 text-gray-500 hover:text-gray-700 flex-shrink-0" onClick={() => setReplyTarget(null)} aria-label="Cancel reply">
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <form ref={formRef} onSubmit={handleSendMessage} className="flex items-center gap-x-1.5 px-2 pt-1.5 pb-1.5">
              <input
                id="file-upload"
                type="file"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  const imgs = files.filter((f) => f.type.startsWith('image/'));
                  const others = files.filter((f) => !f.type.startsWith('image/'));
                  if (imgs.length) addImageFiles(imgs);
                  if (others.length) setAttachmentFile(others[0]);
                }}
                accept="image/*,application/pdf,audio/*"
                multiple
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

              {/* Voice note */}
              <button
                type="button"
                onClick={async () => {
                  if (isRecording) {
                    // stop
                    mediaRecorderRef.current?.stop();
                    setIsRecording(false);
                  } else {
                    recordedChunksRef.current = [];
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                      const mr = new MediaRecorder(stream);
                      mediaRecorderRef.current = mr;
                      mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
                      mr.onstop = async () => {
                        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
                        if (blob.size === 0) return;
                        const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' });
                        // Do not auto-send. Stage as attachment so user can press Send.
                        setAttachmentFile(file);
                        try { setShowEmojiPicker(false); } catch {}
                        try { textareaRef.current?.focus(); } catch {}
                      };
                      mr.start();
                      setIsRecording(true);
                    } catch (e) {
                      console.error('Mic permission error', e);
                      alert('Microphone permission is required to record voice notes.');
                    }
                  }
                }}
                aria-label={isRecording ? 'Stop recording' : 'Record voice note'}
                className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isRecording ? 'bg-red-600 text-white hover:bg-red-700' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                {isRecording ? <XMarkIcon className="w-5 h-5" /> : <MicrophoneIcon className="w-5 h-5" />}
              </button>

              {/* Textarea (16px to avoid iOS zoom) */}
              <div className="flex-1">
              <textarea
                ref={textareaRef}
                value={newMessageContent}
                onChange={(e) => setNewMessageContent(e.target.value)}
                onInput={autoResizeTextarea}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    formRef.current?.requestSubmit();
                  }
                }}
                autoFocus
                rows={1}
                className="w-full flex-grow rounded-xl px-3 py-1 border border-gray-300 shadow-sm resize-none text-base ios-no-zoom font-medium focus:outline-none min-h-[36px]"
                placeholder="Type your message..."
                aria-label="New message input"
                disabled={isUploadingAttachment}
              />
              </div>

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
                className="flex-shrink-0 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center w-8 h-8 p-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isUploadingAttachment || (!newMessageContent.trim() && !attachmentFile && imageFiles.length === 0)}
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

      <ImagePreviewModal
        open={imageModalIndex !== null}
        src={imageModalIndex !== null ? (imageUrls[imageModalIndex] || '') : ''}
        images={imageUrls}
        index={imageModalIndex ?? 0}
        onIndexChange={(i) => setImageModalIndex(i)}
        onReply={() => {
          if (imageModalIndex !== null) {
            const msg = imageMessages[imageModalIndex];
            if (msg) setReplyTarget(msg);
          }
          setImageModalIndex(null);
        }}
        onClose={() => setImageModalIndex(null)}
      />

      {/* Generic file preview (PDF/audio/etc.) */}
      <ImagePreviewModal
        open={Boolean(filePreviewSrc)}
        src={filePreviewSrc || ''}
        onClose={() => setFilePreviewSrc(null)}
        onReply={() => {
          // Best-effort: reply to message that matches this URL (absolute or proxied)
          const m = messages.find((mm) => {
            if (!mm.attachment_url) return false;
            const abs = getFullImageUrl(mm.attachment_url) as string;
            return abs === filePreviewSrc || toProxyPath(abs) === filePreviewSrc;
          });
          if (m) setReplyTarget(m as any);
          setFilePreviewSrc(null);
        }}
      />
    </>
  )}

      {/* Quote Drawer removed */}

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
