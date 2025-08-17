// MessageThread.tsx
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
import {
  getFullImageUrl,
} from '@/lib/utils';
import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';
import { parseBookingDetailsFromMessage } from '@/lib/bookingDetails';
import { DocumentIcon, DocumentTextIcon, FaceSmileIcon } from '@heroicons/react/24/outline';
import {
  Booking,
  BookingSimple,
  Review,
  Message,
  MessageCreate,
  QuoteV2,
  QuoteV2Create,
} from '@/types';
import { ClockIcon, ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
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
  updateBookingRequestArtist,
  useAuth,
} from '@/lib/api';
import useOfflineQueue from '@/hooks/useOfflineQueue';
import Button from '../ui/Button';
import usePaymentModal from '@/hooks/usePaymentModal';
import QuoteBubble from './QuoteBubble';
import InlineQuoteForm from './InlineQuoteForm';
import useWebSocket from '@/hooks/useWebSocket';
import { format, isValid, differenceInCalendarDays, startOfDay } from 'date-fns';
import { AxiosError } from 'axios';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import data from '@emoji-mart/data';
import { createPortal } from 'react-dom';
import BookingSummaryCard from './BookingSummaryCard';
import { t } from '@/lib/i18n';

const MemoQuoteBubble = React.memo(QuoteBubble);
const MemoInlineQuoteForm = React.memo(InlineQuoteForm);
const EmojiPicker = dynamic(() => import('@emoji-mart/react'), { ssr: false });

// Constants
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_BASE = API_BASE.replace(/^http/, 'ws');
const API_V1 = '/api/v1';
const TEN_MINUTES_MS = 10 * 60 * 1000;
const MIN_SCROLL_OFFSET = 20;
const MAX_TEXTAREA_LINES = 10;
const isImageAttachment = (url?: string | null) =>
  !!url && /\.(jpe?g|png|gif|webp)$/i.test(url);

// Generate an ISO timestamp in GMT+2 regardless of client locale
const gmt2ISOString = () =>
  new Date(Date.now() + 2 * 60 * 60 * 1000)
    .toISOString()
    .replace('Z', '+02:00');

const normalizeType = (t?: string | null) => (t ?? '').toUpperCase();

const daySeparatorLabel = (date: Date) => {
  const now = new Date();
  const days = differenceInCalendarDays(startOfDay(now), startOfDay(date));
  if (days === 0) return format(date, 'EEEE');
  if (days === 1) return 'yesterday';
  if (days < 7) return format(date, 'EEEE');
  return format(date, 'EEE, d LLL');
};

// Interfaces
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

  /** NEW: hide composer on mobile when the details panel is open */
  isDetailsPanelOpen?: boolean;
}

// SVG Checkmark Icons
const DoubleCheckmarkIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M12.75 12.75L15 15 18.75 9.75" />
  </svg>
);

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
    isDetailsPanelOpen = false, // NEW
  }: MessageThreadProps,
  ref,
) {
  const { user } = useAuth();
  const router = useRouter();

  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [quotes, setQuotes] = useState<Record<number, QuoteV2>>({});
  const [loading, setLoading] = useState(true);
  const [newMessageContent, setNewMessageContent] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [bookingDetails, setBookingDetails] = useState<Booking | null>(null);
  const [parsedBookingDetails, setParsedBookingDetails] = useState<ParsedBookingDetails | undefined>();
  const [threadError, setThreadError] = useState<string | null>(null);
  const [wsFailed, setWsFailed] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [uploadingProgress, setUploadingProgress] = useState(0);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [announceNewMessage, setAnnounceNewMessage] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [textareaLineHeight, setTextareaLineHeight] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDetailsCard, setShowDetailsCard] = useState(false);
  const [isPortalReady, setIsPortalReady] = useState(false);
  const { enqueue: enqueueMessage } = useOfflineQueue<{
    tempId: number;
    payload: MessageCreate;
  }>('offlineSendQueue', async ({ tempId, payload }) => {
    const res = await postMessageToBookingRequest(bookingRequestId, payload);
    setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...res.data, status: 'sent' } : m)));
  });
  const [typingUsers, setTypingUsers] = useState<number[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [revealedImages, setRevealedImages] = useState<Set<number>>(new Set());

  // Refs
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const prevMessageCountRef = useRef(0);
  const firstUnreadMessageRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);

  // iOS scroll unlock
  const touchStartYRef = useRef(0);
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

  // Derived values
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

  const eventDetails = useMemo(
    () => ({
      from: clientName || 'Client',
      receivedAt: format(new Date(), 'PPP'),
      event: parsedBookingDetails?.eventType,
      date:
        parsedBookingDetails?.date && isValid(new Date(parsedBookingDetails.date))
          ? format(new Date(parsedBookingDetails.date), 'PPP')
          : undefined,
      guests: parsedBookingDetails?.guests,
      venue: parsedBookingDetails?.venueType,
      notes: parsedBookingDetails?.notes,
    }),
    [clientName, parsedBookingDetails],
  );

  /** Focus textarea on mount and when switching threads */
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);
  useEffect(() => {
    textareaRef.current?.focus();
  }, [bookingRequestId]);

  /** Portal is client-only */
  useEffect(() => {
    setIsPortalReady(true);
  }, []);

  const hasSentQuote = useMemo(
    () => messages.some((m) => Number(m.quote_id) > 0),
    [messages],
  );

  // Prefill quote form (artist side)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await getBookingRequestById(bookingRequestId);
        if (cancelled) return;
        const br = res.data;
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
    if (user?.user_type === 'service_provider' && !bookingConfirmed && !hasSentQuote) {
      void load();
    }
    return () => {
      cancelled = true;
    };
  }, [
    bookingRequestId,
    serviceId,
    user?.user_type,
    bookingConfirmed,
    hasSentQuote,
    parsedBookingDetails,
    initialSound,
  ]);

  const typingIndicator = useMemo(() => {
    const names = typingUsers.map((id) =>
      id === currentArtistId ? artistName : id === currentClientId ? clientName : 'Participant',
    );
    if (isSystemTyping) names.push('System');
    if (names.length === 0) return null;
    const verb = names.length > 1 ? 'are' : 'is';
    return `${names.join(' and ')} ${verb} typing...`;
  }, [typingUsers, isSystemTyping, currentArtistId, currentClientId, artistName, clientName]);

  // Payment modal (thread local for details portal)
  const [paymentInfo, setPaymentInfo] = useState<{ status: string | null; amount: number | null; receiptUrl: string | null }>({ status: null, amount: null, receiptUrl: null });
  const { openPaymentModal, paymentModal } = usePaymentModal(
    useCallback(({ status, amount, receiptUrl: url }) => {
      setPaymentInfo({ status: status ?? null, amount: amount ?? null, receiptUrl: url ?? null });
      onPaymentStatusChange?.(status, amount, url ?? null);
    }, [onPaymentStatusChange]),
    useCallback(() => {}, []),
  );

  // Calculate textarea line height once
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

  // Auto-resize textarea
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

    // Keep latest messages visible when textarea grows (unless user scrolled up)
    const diff = newH - prevH;
    if (container && diff !== 0 && !isUserScrolledUp) {
      container.scrollTop += diff;
    }
  }, [textareaLineHeight, isUserScrolledUp]);

  useEffect(() => {
    autoResizeTextarea();
  }, [newMessageContent, autoResizeTextarea]);

  // Clicking outside emoji picker closes it
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

  // Track composer height (for list bottom padding)
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

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMessagesForBookingRequest(bookingRequestId);
      let parsedDetails: ParsedBookingDetails | undefined;

      const filteredMessages = res.data.filter((msg) => {
        const type = normalizeType(msg.message_type);
        if (type === 'SYSTEM' && msg.content.startsWith(BOOKING_DETAILS_PREFIX)) {
          parsedDetails = parseBookingDetailsFromMessage(msg.content);
          return false;
        }
        if (type === 'USER' && initialNotes && msg.content.trim() === initialNotes.trim()) return false;
        return true;
      });

      setMessages(filteredMessages);
      setParsedBookingDetails(parsedDetails);

      const hasUnread = filteredMessages.some((msg) => msg.sender_id !== user?.id && !msg.is_read);
      if (hasUnread) {
        try {
          await markMessagesRead(bookingRequestId);
        } catch (err) {
          console.error('Failed to mark messages read:', err);
        }
      }

      filteredMessages.forEach((msg) => {
        const quoteId = Number(msg.quote_id);
        const isQuote =
          quoteId > 0 &&
          (normalizeType(msg.message_type) === 'QUOTE' ||
            (normalizeType(msg.message_type) === 'SYSTEM' && msg.action === 'review_quote'));
        if (isQuote) void ensureQuoteLoaded(quoteId);
      });

      if (parsedDetails && onBookingDetailsParsed) onBookingDetailsParsed(parsedDetails);
      setThreadError(null);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
      setThreadError(`Failed to load messages. ${(err as Error).message || 'Please try again.'}`);
    } finally {
      setLoading(false);
    }
  }, [bookingRequestId, user?.id, initialNotes, onBookingDetailsParsed, ensureQuoteLoaded]);

  useImperativeHandle(ref, () => ({ refreshMessages: fetchMessages }), [fetchMessages]);
  useEffect(() => { fetchMessages(); }, [bookingRequestId, fetchMessages]);

  // WebSocket
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

  useEffect(
    () =>
      onSocketMessage((event) => {
        const incoming = JSON.parse(event.data) as Partial<Message> & {
          type?: string;
          users?: number[];
        };
        if (incoming.type === 'typing' && Array.isArray(incoming.users)) {
          setTypingUsers(incoming.users.filter((id) => id !== user?.id));
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setTypingUsers([]), 2000);
          return;
        }
        const incomingMsg = incoming as Message;
        if (normalizeType(incomingMsg.message_type) === 'SYSTEM' && incomingMsg.content.startsWith(BOOKING_DETAILS_PREFIX)) {
          onBookingDetailsParsed?.(parseBookingDetailsFromMessage(incomingMsg.content));
          return;
        }
        setMessages((prevMessages) => {
          if (
            prevMessages.some((prevMsg) => prevMsg.id === incomingMsg.id) ||
            (initialNotes && normalizeType(incomingMsg.message_type) === 'USER' && incomingMsg.content.trim() === initialNotes.trim())
          ) {
            return prevMessages;
          }
          return [...prevMessages.slice(-199), incomingMsg];
        });
        const incomingQuoteId = Number(incomingMsg.quote_id);
        const isQuoteMsg =
          incomingQuoteId > 0 &&
          (normalizeType(incomingMsg.message_type) === 'QUOTE' ||
            (normalizeType(incomingMsg.message_type) === 'SYSTEM' && incomingMsg.action === 'review_quote'));
        if (isQuoteMsg) void ensureQuoteLoaded(incomingQuoteId);
      }),
    [onSocketMessage, ensureQuoteLoaded, initialNotes, onBookingDetailsParsed, user?.id],
  );

  // Attachment preview URL
  useEffect(() => {
    if (attachmentFile) {
      const url = URL.createObjectURL(attachmentFile);
      setAttachmentPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setAttachmentPreviewUrl(null);
    return () => {};
  }, [attachmentFile]);

  // Refined scrolling logic
  useEffect(() => {
    if (!messagesContainerRef.current || !messagesEndRef.current) return;
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

  // Close details card on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowDetailsCard(false); };
    if (showDetailsCard) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showDetailsCard]);

  useEffect(() => {
    if (prevMessageCountRef.current && messages.length > prevMessageCountRef.current && showScrollButton) {
      setAnnounceNewMessage('New messages available');
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, showScrollButton]);

  // Visible messages & grouping
  const visibleMessages = useMemo(() => {
    const quoteIds = new Set<number>();
    messages.forEach((m) => {
      const qid = Number(m.quote_id);
      if (normalizeType(m.message_type) === 'QUOTE' && !Number.isNaN(qid)) {
        quoteIds.add(qid);
      }
    });

    return messages.filter((msg) => {
      const visibleToCurrentUser =
        !msg.visible_to ||
        msg.visible_to === 'both' ||
        (user?.user_type === 'service_provider' && msg.visible_to === 'service_provider') ||
        (user?.user_type === 'client' && msg.visible_to === 'client');

      const qid = Number(msg.quote_id);
      return (
        visibleToCurrentUser &&
        msg.content &&
        msg.content.trim().length > 0 &&
        !(normalizeType(msg.message_type) === 'SYSTEM' && msg.content.startsWith(BOOKING_DETAILS_PREFIX)) &&
        !(normalizeType(msg.message_type) === 'SYSTEM' &&
          msg.action === 'review_quote' &&
          (Number.isNaN(qid) || qid <= 0)) &&
        !(
          normalizeType(msg.message_type) === 'SYSTEM' &&
          msg.action === 'review_quote' &&
          !Number.isNaN(qid) &&
          quoteIds.has(qid)
        )
      );
    });
  }, [messages, user?.user_type]);

  const shouldShowTimestampGroup = useCallback(
    (msg: Message, index: number, list: Message[]) => {
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

  const groupedMessages = useMemo(() => {
    const groups: { sender_id: number | null; sender_type: string; messages: Message[]; showDayDivider: boolean }[] = [];
    visibleMessages.forEach((msg, idx) => {
      const isNewGroupNeeded = shouldShowTimestampGroup(msg, idx, visibleMessages);
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

  // Emoji select
  const handleEmojiSelect = (emoji: { native?: string }) => {
    if (emoji?.native) setNewMessageContent((prev) => `${prev}${emoji.native}`);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  // Send message
  const handleSendMessage = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newMessageContent.trim() && !attachmentFile) return;

      if (attachmentFile && !navigator.onLine) {
        setThreadError('Cannot send attachments while offline.');
        return;
      }

      let attachment_url: string | undefined;
      const tempId = Date.now();

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

        const optimistic: Message = {
          id: tempId,
          booking_request_id: bookingRequestId,
          sender_id: user?.id || 0,
          sender_type: user?.user_type === 'service_provider' ? 'artist' : 'client',
          content: payload.content,
          message_type: 'USER',
          quote_id: null,
          attachment_url,
          visible_to: 'both',
          action: null,
          avatar_url: undefined,
          expires_at: null,
          unread: false,
          is_read: true,
          timestamp: gmt2ISOString(),
          status: 'sending',
        };
        setMessages((prev) => [...prev, optimistic]);

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
          setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'queued' } : m)));
          enqueueMessage({ tempId, payload });
          resetInput();
          return;
        }

        try {
          const res = await postMessageToBookingRequest(bookingRequestId, payload);
          setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...res.data, status: 'sent' } : m)));
          onMessageSent?.();
        } catch (err) {
          console.error('Failed to send message:', err);
          setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'queued' } : m)));
          enqueueMessage({ tempId, payload });
          setThreadError(`Failed to send message. ${(err as Error).message || 'Please try again later.'}`);
        }

        resetInput();
      } catch (err) {
        console.error('Failed to send message:', err);
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
        const message =
          err instanceof AxiosError && err.response?.status === 422
            ? 'Attachment file missing. Please select a file before sending.'
            : (err as Error).message || 'Please try again later.';
        setThreadError(`Failed to send message. ${message}`);
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

  // Send/decline/accept quotes
  const handleSendQuote = useCallback(
    async (quoteData: QuoteV2Create) => {
      try {
        await createQuoteV2(quoteData);
        void fetchMessages();
        onMessageSent?.();
        onQuoteSent?.();
      } catch (err) {
        console.error('Failed to send quote:', err);
        setThreadError(`Failed to send quote. ${(err as Error).message || 'Please try again.'}`);
      }
    },
    [fetchMessages, onMessageSent, onQuoteSent],
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
        setBookingConfirmed(true);
        onBookingConfirmedChange?.(true, details.data);
        setBookingDetails(details.data);

        if (bookingSimple?.payment_id) {
          window.open(`/api/v1/payments/${bookingSimple.payment_id}/receipt`, '_blank');
        }
        void fetchMessages();
      } catch (err) {
        console.error('Failed to finalize quote acceptance process:', err);
        setThreadError(`Quote accepted, but there was an issue setting up payment. ${(err as Error).message || 'Please try again.'}`);
      }
    },
    [bookingRequestId, fetchMessages, serviceId, onBookingConfirmedChange],
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

  /** NEW: when the details panel opens on mobile, blur textarea & close emoji */
  useEffect(() => {
    if (isDetailsPanelOpen) {
      textareaRef.current?.blur();
      setShowEmojiPicker(false);
    }
  }, [isDetailsPanelOpen]);

  /** Compute bottom padding so nothing is obscured */
  const effectiveBottomPadding = isDetailsPanelOpen
    ? 'calc(var(--mobile-bottom-nav-height, 0px) + env(safe-area-inset-bottom))'
    : `calc(${composerHeight || 0}px + var(--mobile-bottom-nav-height, 0px) + env(safe-area-inset-bottom))`;

  return (
    <div className="flex flex-col rounded-b-2xl overflow-hidden w-full bg-white h-full min-h-0">
      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        onTouchStart={handleTouchStartOnList}
        onTouchMove={handleTouchMoveOnList}
        onWheel={handleWheelOnList}
        className="relative flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 bg-white px-3 pt-3"
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          paddingBottom: effectiveBottomPadding,
        }}
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
                  {t(
                    'chat.empty.client',
                    'Your request is in - expect a quote soon. Add any notes or questions below.',
                  )}
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
                  {t(
                    'chat.empty.artist',
                    'No messages yet—say hi or share details. You can send a quick quote when you’re ready.',
                  )}
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
          const isSystemMessage = normalizeType(firstMsgInGroup.message_type) === 'SYSTEM';
          const isSenderSelf = firstMsgInGroup.sender_id === user?.id;

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

              {/* Message Group */}
              <div className="flex flex-col w-full">
                {/* Sender info (not system/self) */}
                {!isSenderSelf && !isSystemMessage && (
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

                {/* Messages in group */}
                {group.messages.map((msg, msgIdx) => {
                  const isMsgFromSelf = msg.sender_id === user?.id;
                  const isLastInGroup = msgIdx === group.messages.length - 1;

                  let bubbleShape = 'rounded-xl';
                  if (isSystemMessage) {
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

                  if (isSystemMessage) {
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
                    const isClient = user?.user_type === 'client';
                    return (
                      <div
                        key={msg.id}
                        id={`quote-${quoteId}`}
                        className="mb-0.5 w/full"
                        ref={idx === firstUnreadIndex && msgIdx === 0 ? firstUnreadMessageRef : null}
                      >
                        {isClient && quoteData.status === 'pending' && !bookingConfirmed && (
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
                          expiresAt={quoteData.expires_at || undefined}
                          eventDetails={{
                            from: clientName || 'Client',
                            receivedAt: format(new Date(msg.timestamp), 'PPP'),
                            event: parsedBookingDetails?.eventType,
                            date: (() => {
                              if (!parsedBookingDetails?.date) return undefined;
                              const eventDate = new Date(parsedBookingDetails.date);
                              return isValid(eventDate) ? format(eventDate, 'PPP') : undefined;
                            })(),
                            guests: parsedBookingDetails?.guests,
                            venue: parsedBookingDetails?.venueType,
                            notes: parsedBookingDetails?.notes,
                          }}
                          onAccept={
                            user?.user_type === 'client' && quoteData.status === 'pending' && !bookingConfirmed
                              ? () => handleAcceptQuote(quoteData)
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
                                    {t('quote.guidance.acceptCta', 'Ready to go? Tap Accept to secure the date. You can pay the deposit right after.')}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="my-2">
                              <div className="h-px w-full bg-gray-200" />
                            </div>
                          </>
                        )}
                      </div>
                    );
                  }

                  if (normalizeType(msg.message_type) === 'SYSTEM' && msg.action === 'review_quote') {
                    return null;
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`relative inline-block w-auto max-w-[75%] px-3 py-2 text-[13px] leading-snug ${bubbleClasses} ${msgIdx < group.messages.length - 1 ? 'mb-0.5' : ''} ${isMsgFromSelf ? 'ml-auto mr-0' : 'mr-auto ml-0'}`}
                      ref={idx === firstUnreadIndex && msgIdx === 0 ? firstUnreadMessageRef : null}
                    >
                      <div className="pr-9">
                        {msg.sender_id !== user?.id && !msg.is_read && (
                          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" aria-label="Unread message" />
                        )}
                        {normalizeType(msg.message_type) === 'SYSTEM' && msg.action === 'view_booking_details' ? (
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
                          msg.content
                        )}
                        {msg.attachment_url && (
                          isImageAttachment(msg.attachment_url) ? (
                            revealedImages.has(msg.id) ? (
                              <Image
                                src={getFullImageUrl(msg.attachment_url) as string}
                                alt="Image attachment"
                                width={200}
                                height={200}
                                className="mt-1 rounded"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => setRevealedImages((prev) => new Set(prev).add(msg.id))}
                                className="block text-indigo-400 underline mt-1 text-xs hover:text-indigo-300"
                              >
                                View image
                              </button>
                            )
                          ) : (
                            <a
                              href={msg.attachment_url}
                              target="_blank"
                              className="block text-indigo-400 underline mt-1 text-xs hover:text-indigo-300"
                              rel="noopener noreferrer"
                            >
                              View attachment
                            </a>
                          )
                        )}
                      </div>
                      {/* Timestamp & status */}
                      <div className="absolute bottom-0.5 right-1.5 flex items-center space-x-0.5 text-[10px] text-right text-gray-500">
                        <time dateTime={msg.timestamp} title={new Date(msg.timestamp).toLocaleString()}>
                          {messageTime}
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
                allowInstantBooking={allowInstantBooking}
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

              {/* Textarea (16px font to avoid iOS zoom) */}
              <textarea
                ref={textareaRef}
                value={newMessageContent}
                onChange={(e) => setNewMessageContent(e.target.value)}
                onInput={autoResizeTextarea}
                autoFocus
                rows={1}
                className="flex-grow rounded-xl px-3 py-1 border border-gray-300 shadow-sm resize-none
                           text-base ios-no-zoom font-medium focus:outline-none min-h-[36px]"
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
